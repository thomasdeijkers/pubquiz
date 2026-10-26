"""Pubquiz beheer-API. Alleen loopback; HTTPS en CORS verlopen via nginx."""
import argparse
import json
import os
import re
import unicodedata
import uuid
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import psycopg2
from psycopg2.extras import RealDictCursor, Json

DSN = os.environ.get('PUBQUIZ_DSN', 'dbname=pubquiz user=pubquiz host=/var/run/postgresql')
ORIGIN = 'https://pubquiz.opticore-insights.nl'
PREFIX = '/pubquiz-api/v1'
SCHEMA = '''
CREATE TABLE IF NOT EXISTS quiz_meta (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO quiz_meta VALUES ('revision','0') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS quiz_rounds (
 id text PRIMARY KEY, sort_order integer NOT NULL, title text NOT NULL,
 closed boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS quiz_questions (
 round_id text REFERENCES quiz_rounds(id), id text, prompt text NOT NULL,
 correct text NOT NULL DEFAULT '', alternatives jsonb NOT NULL DEFAULT '[]',
 max_cents integer NOT NULL CHECK(max_cents BETWEEN 0 AND 100000),
 version integer NOT NULL DEFAULT 1, PRIMARY KEY(round_id,id));
CREATE TABLE IF NOT EXISTS quiz_teams (
 id uuid PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1);
ALTER TABLE quiz_teams ADD COLUMN IF NOT EXISTS members text NOT NULL DEFAULT '';
ALTER TABLE quiz_teams ADD COLUMN IF NOT EXISTS bingo_card smallint CHECK(bingo_card BETWEEN 1 AND 3);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_team_name ON quiz_teams(lower(name));
CREATE TABLE IF NOT EXISTS quiz_answers (
 team_id uuid REFERENCES quiz_teams(id), round_id text, question_id text,
 answer text NOT NULL DEFAULT '', points_cents integer CHECK(points_cents >= 0),
 version integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,round_id,question_id),
 FOREIGN KEY(round_id,question_id) REFERENCES quiz_questions(round_id,id));
CREATE TABLE IF NOT EXISTS quiz_changes (
 id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL,
 details text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS quiz_bingo_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), data jsonb NOT NULL);
'''


class Problem(Exception):
    def __init__(self, status, message, **extra):
        self.status, self.message, self.extra = status, message, extra


def connect():
    return psycopg2.connect(DSN, cursor_factory=RealDictCursor, connect_timeout=5)


def text(value, limit=3000, required=False):
    if not isinstance(value, str) or len(value) > limit:
        raise Problem(400, 'Ongeldige tekst of tekst te lang.')
    value = value.strip()
    if required and not value:
        raise Problem(400, 'Vul de verplichte velden in.')
    return value


def version(value):
    if type(value) is not int or value < 0:
        raise Problem(400, 'Ongeldige wijzigingsversie.')
    return value


def bingo_card(value):
    if value is None or value == '':
        return None
    if type(value) is int and value in (1, 2, 3):
        return value
    if type(value) is str and value in ('1', '2', '3'):
        return int(value)
    raise Problem(400, 'Kies bingokaart K1, K2 of K3.')


def cents(value):
    if isinstance(value, bool):
        raise Problem(400, 'Vul een geldig puntenaantal in.')
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > 1000 or amount * 100 != (amount * 100).to_integral_value():
            raise InvalidOperation
        return int(amount * 100)
    except (InvalidOperation, ValueError, TypeError):
        raise Problem(400, 'Gebruik 0 tot 1000 punten met maximaal twee decimalen.')


def normalized(value):
    return re.sub(r'[^a-z0-9]+', '', ''.join(c for c in unicodedata.normalize('NFKD', value.casefold()) if not unicodedata.combining(c)))


def matches(answer, question):
    actual = normalized(answer)
    if not actual:
        return False
    expected = [question['correct']] + question['alternatives']
    for candidate in expected:
        if not candidate.strip():
            continue
        variants = [candidate]
        choice = re.match(r'^([A-G])[).]\s*(.+)$', candidate.strip(), re.S)
        if choice:
            variants += [choice[1], choice[2]]
        if actual in [normalized(item) for item in variants]:
            return True
    return False


def changed(cur, actor, action, details):
    cur.execute("UPDATE quiz_meta SET value=(value::bigint+1)::text WHERE key='revision'")
    cur.execute('INSERT INTO quiz_changes(actor,action,details) VALUES (%s,%s,%s)', (actor, action, details))


def lock_round(cur, round_id):
    cur.execute('SELECT * FROM quiz_rounds WHERE id=%s FOR UPDATE', (round_id,))
    item = cur.fetchone()
    if not item:
        raise Problem(404, 'Deze ronde bestaat niet.')
    return item


def open_round(cur, round_id):
    item = lock_round(cur, round_id)
    if item['closed']:
        raise Problem(409, 'Deze ronde is afgesloten. Heropen de ronde om wijzigingen te maken.')
    return item


def team(cur, team_id):
    try:
        uuid.UUID(team_id)
    except (ValueError, TypeError, AttributeError):
        raise Problem(400, 'Ongeldig team.')
    cur.execute('SELECT * FROM quiz_teams WHERE id=%s FOR UPDATE', (team_id,))
    item = cur.fetchone()
    if not item or not item['active']:
        raise Problem(404, 'Dit team is niet actief.')
    return item


def state(cur):
    result = {}
    cur.execute("SELECT value::bigint AS revision FROM quiz_meta WHERE key='revision'")
    result.update(cur.fetchone())
    for key, sql in [
        ('rounds', 'SELECT * FROM quiz_rounds ORDER BY sort_order'),
        ('questions', 'SELECT * FROM quiz_questions ORDER BY round_id,id::integer'),
        ('teams', 'SELECT * FROM quiz_teams ORDER BY lower(name)'),
        ('answers', 'SELECT * FROM quiz_answers'),
        ('changes', 'SELECT actor,action,details,created_at FROM quiz_changes ORDER BY id DESC LIMIT 15'),
    ]:
        cur.execute(sql)
        result[key] = [dict(row) for row in cur.fetchall()]
    cur.execute('SELECT data FROM quiz_bingo_config WHERE id=true')
    bingo = cur.fetchone()
    result['bingo'] = bingo['data'] if bingo else None
    return result


def standings_state(cur):
    # The public scoreboard needs no model answers, team answers or audit data.
    result = {}
    for key, sql in [
        ('rounds', 'SELECT id,sort_order,title,closed FROM quiz_rounds ORDER BY sort_order'),
        ('questions', 'SELECT round_id,id FROM quiz_questions'),
        ('teams', 'SELECT id,name,active FROM quiz_teams WHERE active=true ORDER BY lower(name)'),
        ('answers', 'SELECT a.team_id,a.round_id,a.question_id,a.points_cents FROM quiz_answers a JOIN quiz_teams t ON t.id=a.team_id WHERE t.active=true'),
    ]:
        cur.execute(sql)
        result[key] = [dict(row) for row in cur.fetchall()]
    return result


def mutate(cur, route, body):
    actor = text(body.get('actor', ''), 80, True)
    if route == '/teams/add':
        name = text(body.get('name'), 80, True)
        members = text(body.get('members', ''), 2000)
        card = bingo_card(body.get('bingo_card'))
        cur.execute('SELECT count(*) AS total FROM quiz_teams')
        if cur.fetchone()['total'] >= 250:
            raise Problem(400, 'Maximaal 250 teams mogelijk.')
        team_id = str(uuid.uuid4())
        cur.execute('INSERT INTO quiz_teams(id,name,members,bingo_card) VALUES(%s,%s,%s,%s)', (team_id, name, members, card))
        changed(cur, actor, 'Team toegevoegd', name)
        return {'id': team_id}
    if route in ('/teams/update', '/teams/delete'):
        team_id = text(body.get('id'), 40, True)
        try:
            uuid.UUID(team_id)
        except ValueError:
            raise Problem(400, 'Ongeldig team.')
        cur.execute('SELECT * FROM quiz_teams WHERE id=%s FOR UPDATE', (team_id,))
        item = cur.fetchone()
        if not item:
            raise Problem(404, 'Team niet gevonden.')
        if item['version'] != version(body.get('version')):
            raise Problem(409, 'Dit team is zojuist gewijzigd door een andere organisator.')
        if route == '/teams/delete':
            cur.execute('DELETE FROM quiz_answers WHERE team_id=%s', (team_id,))
            cur.execute('DELETE FROM quiz_teams WHERE id=%s', (team_id,))
            changed(cur, actor, 'Team verwijderd', item['name'])
            return {'ok': True}
        name = text(body.get('name', item['name']), 80, True)
        members = text(body.get('members', item['members']), 2000)
        card = bingo_card(body.get('bingo_card', item['bingo_card']))
        active = body.get('active', item['active'])
        if type(active) is not bool:
            raise Problem(400, 'Ongeldige teamstatus.')
        cur.execute('UPDATE quiz_teams SET name=%s,members=%s,bingo_card=%s,active=%s,version=version+1 WHERE id=%s', (name, members, card, active, team_id))
        changed(cur, actor, 'Team bijgewerkt', name)
        return {'ok': True}
    if route == '/answers/save':
        round_id = text(body.get('round_id'), 20, True)
        question_id = text(body.get('question_id'), 20, True)
        team_id = text(body.get('team_id'), 40, True)
        open_round(cur, round_id)
        team(cur, team_id)
        cur.execute('SELECT * FROM quiz_questions WHERE round_id=%s AND id=%s', (round_id, question_id))
        question = cur.fetchone()
        if not question:
            raise Problem(404, 'Vraag niet gevonden.')
        cur.execute('SELECT * FROM quiz_answers WHERE team_id=%s AND round_id=%s AND question_id=%s FOR UPDATE', (team_id, round_id, question_id))
        current = cur.fetchone()
        if version(body.get('version')) != (current['version'] if current else 0):
            raise Problem(409, 'Een andere organisator heeft dit antwoord gewijzigd. Jouw invoer is niet overschreven.', current=dict(current) if current else None)
        answer = text(body.get('answer', current['answer'] if current else ''))
        score = current['points_cents'] if current else None
        if current and answer != current['answer']:
            score = None
        if 'points' in body:
            score = None if body['points'] is None else cents(body['points'])
        if score is not None and score > question['max_cents']:
            raise Problem(400, 'Het puntenaantal is hoger dan het maximum voor deze vraag.')
        cur.execute('''INSERT INTO quiz_answers(team_id,round_id,question_id,answer,points_cents,updated_by)
          VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(team_id,round_id,question_id)
          DO UPDATE SET answer=excluded.answer,points_cents=excluded.points_cents,
          updated_by=excluded.updated_by,updated_at=now(),version=quiz_answers.version+1 RETURNING *''',
          (team_id, round_id, question_id, answer, score, actor))
        result = dict(cur.fetchone())
        changed(cur, actor, 'Antwoord beoordeeld' if score is not None else 'Antwoord opgeslagen', f'{team_id} · ronde {round_id} · vraag {question_id}')
        return result
    if route == '/questions/save':
        rid, qid = text(body.get('round_id'), 20, True), text(body.get('id'), 20, True)
        open_round(cur, rid)
        cur.execute('SELECT * FROM quiz_questions WHERE round_id=%s AND id=%s FOR UPDATE', (rid, qid))
        question = cur.fetchone()
        if not question:
            raise Problem(404, 'Vraag niet gevonden.')
        if version(body.get('version')) != question['version']:
            raise Problem(409, 'Deze vraag is gewijzigd door een andere organisator.')
        maximum = cents(body.get('max_points'))
        if maximum != question['max_cents']:
            cur.execute('SELECT 1 FROM quiz_answers WHERE round_id=%s AND question_id=%s AND points_cents IS NOT NULL LIMIT 1', (rid, qid))
            if cur.fetchone():
                raise Problem(409, 'Deze vraag is al beoordeeld. Maak de beoordelingen eerst ongedaan voordat je de maximumscore wijzigt.')
        alternatives = body.get('alternatives', [])
        if not isinstance(alternatives, list) or len(alternatives) > 50:
            raise Problem(400, 'Maximaal 50 antwoordvarianten mogelijk.')
        alternatives = [text(value, 500, True) for value in alternatives]
        cur.execute('UPDATE quiz_questions SET prompt=%s,correct=%s,alternatives=%s,max_cents=%s,version=version+1 WHERE round_id=%s AND id=%s',
          (text(body.get('prompt'), 3000, True), text(body.get('correct', ''), 3000), Json(alternatives), maximum, rid, qid))
        changed(cur, actor, 'Antwoordmodel aangepast', f'Ronde {rid} · vraag {qid}')
        return {'ok': True}
    if route == '/settings/scoring':
        rid = text(body.get('round_id'), 20, True)
        round_item = open_round(cur, rid)
        mode = body.get('existing_scores', 'keep')
        if mode not in ('keep', 'scale'):
            raise Problem(400, 'Kies hoe bestaande beoordelingen behandeld moeten worden.')
        items = body.get('questions')
        if not isinstance(items, list) or not 1 <= len(items) <= 200:
            raise Problem(400, 'Geef de puntentelling van één ronde op.')
        cur.execute('SELECT * FROM quiz_questions WHERE round_id=%s FOR UPDATE', (rid,))
        questions_by_id = {question['id']: question for question in cur.fetchall()}
        updates, seen = [], set()
        # Validate the entire round before making any change.
        for item in items:
            if not isinstance(item, dict):
                raise Problem(400, 'Ongeldige vraaginstelling.')
            qid = text(item.get('id'), 20, True)
            if qid in seen or qid not in questions_by_id:
                raise Problem(400, 'Vraag niet gevonden of dubbel opgegeven.')
            seen.add(qid)
            question = questions_by_id[qid]
            if version(item.get('version')) != question['version']:
                raise Problem(409, 'De puntentelling of het antwoordmodel is gewijzigd door een andere organisator. Vernieuw de instellingen.')
            maximum = cents(item.get('max_points'))
            if maximum == question['max_cents']:
                continue
            cur.execute('SELECT count(points_cents) AS reviewed,max(points_cents) AS highest FROM quiz_answers WHERE round_id=%s AND question_id=%s', (rid, qid))
            existing = cur.fetchone()
            if mode == 'keep' and existing['highest'] is not None and existing['highest'] > maximum:
                raise Problem(409, f'Vraag {qid} heeft al een beoordeling boven het nieuwe maximum. Kies evenredig herberekenen of corrigeer die beoordeling eerst.')
            if mode == 'scale' and question['max_cents'] == 0 and existing['reviewed']:
                raise Problem(409, f'Vraag {qid} stond op 0 punten en is al beoordeeld. Deze beoordelingen kunnen niet naar verhouding worden herberekend. Behoud de bestaande punten of wis de beoordelingen en kijk opnieuw na.')
            updates.append((question, maximum))
        for question, maximum in updates:
            qid = question['id']
            if mode == 'scale' and question['max_cents']:
                cur.execute('''UPDATE quiz_answers SET points_cents=round(points_cents::numeric * %s / %s)::integer,
                    version=version+1,updated_by=%s,updated_at=now() WHERE round_id=%s AND question_id=%s''',
                    (maximum, question['max_cents'], actor, rid, qid))
            else:
                # Also invalidate drafts when retaining scores: another organizer may still have the old maximum in view.
                cur.execute('UPDATE quiz_answers SET version=version+1 WHERE round_id=%s AND question_id=%s', (rid, qid))
            cur.execute('UPDATE quiz_questions SET max_cents=%s,version=version+1 WHERE round_id=%s AND id=%s', (maximum, rid, qid))
        if updates:
            changed(cur, actor, 'Puntentelling aangepast', f"{round_item['title']} · {len(updates)} vragen · " + ('bestaande punten herberekend' if mode == 'scale' else 'bestaande punten behouden'))
        return {'ok': True, 'changed': len(updates), 'existing_scores': mode}
    if route == '/rounds/status':
        rid = text(body.get('id'), 20, True)
        item = lock_round(cur, rid)
        if version(body.get('version')) != item['version']:
            raise Problem(409, 'De rondestatus is zojuist gewijzigd.')
        closed = body.get('closed')
        if type(closed) is not bool:
            raise Problem(400, 'Ongeldige rondestatus.')
        if closed:
            # Every answer write locks the same round, so closing cannot race grading.
            cur.execute('SELECT count(*) AS total FROM quiz_teams WHERE active')
            if not cur.fetchone()['total']:
                raise Problem(400, 'Voeg eerst teams toe.')
            cur.execute('''SELECT count(*) AS missing FROM quiz_teams t CROSS JOIN quiz_questions q
                LEFT JOIN quiz_answers a ON a.team_id=t.id AND a.round_id=q.round_id AND a.question_id=q.id
                WHERE t.active AND q.round_id=%s AND a.points_cents IS NULL''', (rid,))
            missing = cur.fetchone()['missing']
            if missing:
                raise Problem(409, f'Er moeten nog {missing} antwoorden worden beoordeeld.')
        cur.execute('UPDATE quiz_rounds SET closed=%s,version=version+1 WHERE id=%s', (closed, rid))
        changed(cur, actor, 'Ronde afgesloten' if closed else 'Ronde heropend', item['title'])
        return {'ok': True}
    if route == '/answers/match':
        rid, tid = text(body.get('round_id'), 20, True), text(body.get('team_id'), 40, True)
        open_round(cur, rid)
        team(cur, tid)
        cur.execute('''SELECT q.*,a.answer,a.version AS answer_version FROM quiz_questions q JOIN quiz_answers a
            ON q.round_id=a.round_id AND q.id=a.question_id WHERE a.team_id=%s AND q.round_id=%s AND a.points_cents IS NULL''', (tid, rid))
        found = [row for row in cur.fetchall() if matches(row['answer'], row)]
        for question in found:
            cur.execute('UPDATE quiz_answers SET points_cents=%s,version=version+1,updated_by=%s,updated_at=now() WHERE team_id=%s AND round_id=%s AND question_id=%s',
                (question['max_cents'], actor, tid, rid, question['id']))
        if found:
            changed(cur, actor, 'Gelijke antwoorden herkend', f'{len(found)} antwoorden · ronde {rid}')
        return {'matched': len(found)}
    raise Problem(404, 'Deze actie bestaat niet.')


class Handler(BaseHTTPRequestHandler):
    server_version = 'Pubquiz'
    protocol_version = 'HTTP/1.1'

    def reply(self, status, payload):
        content = json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Vary', 'Origin')
        if self.headers.get('Origin') == ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        if self.headers.get('Origin') != ORIGIN:
            return self.reply(403, {'error': 'Deze website heeft geen toegang.'})
        self.reply(200, {'ok': True})

    def reply_image(self, filename):
        files = {'dj-nieuw.png', 'bingo-broninstructie.png'}
        if filename not in files:
            raise Problem(404, 'Bestand niet gevonden.')
        file = Path('/var/lib/pubquiz/media') / filename
        if not file.is_file():
            raise Problem(404, 'Dit bestand is nog niet beschikbaar.')
        content = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Vary', 'Origin')
        if self.headers.get('Origin') == ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        self.handle_api()

    def do_POST(self):
        self.handle_api()

    def handle_api(self):
        route = urlsplit(self.path).path
        if route == PREFIX + '/health' and self.command == 'GET':
            try:
                with connect() as db:
                    with db.cursor() as cur:
                        cur.execute('SELECT 1')
                return self.reply(200, {'ok': True})
            except psycopg2.Error:
                return self.reply(503, {'error': 'Database tijdelijk niet bereikbaar.'})
        if not route.startswith(PREFIX + '/'):
            return self.reply(404, {'error': 'Niet gevonden.'})
        connection = None
        try:
            origin = self.headers.get('Origin')
            if origin and origin != ORIGIN:
                raise Problem(403, 'Deze website heeft geen toegang.')
            if self.command == 'POST' and origin != ORIGIN:
                raise Problem(403, 'Open het beheer via de quizwebsite.')
            connection = connect()
            if self.command == 'GET':
                connection.set_session(isolation_level='REPEATABLE READ', readonly=True)
            with connection:
                with connection.cursor() as cur:
                    route = route[len(PREFIX):]
                    if self.command == 'GET' and route in ('/state', '/backup'):
                        result = state(cur)
                        if route == '/backup':
                            result.update({'format': 'pubquiz-backup', 'version': 1})
                    elif self.command == 'GET' and route == '/standings':
                        result = standings_state(cur)
                    elif self.command == 'GET' and route == '/revision':
                        cur.execute("SELECT value::bigint AS revision FROM quiz_meta WHERE key='revision'")
                        result = dict(cur.fetchone())
                    elif self.command == 'GET' and route.startswith('/media/'):
                        return self.reply_image(route[len('/media/'):])
                    elif self.command == 'POST':
                        if self.headers.get_content_type() != 'application/json':
                            raise Problem(415, 'Gebruik JSON voor deze actie.')
                        try:
                            length = int(self.headers.get('Content-Length', '0'))
                        except ValueError:
                            raise Problem(400, 'Ongeldig verzoek.')
                        if length < 2 or length > 100000:
                            raise Problem(413, 'Het verzoek is te groot of leeg.')
                        try:
                            body = json.loads(self.rfile.read(length))
                        except (ValueError, UnicodeError):
                            raise Problem(400, 'Ongeldige gegevens.')
                        if not isinstance(body, dict):
                            raise Problem(400, 'Ongeldige gegevens.')
                        result = mutate(cur, route, body)
                    else:
                        raise Problem(404, 'Niet gevonden.')
            self.reply(200, result)
        except Problem as problem:
            self.reply(problem.status, {'error': problem.message, **problem.extra})
        except psycopg2.errors.UniqueViolation:
            self.reply(409, {'error': 'Er bestaat al een team met deze naam.'})
        except (psycopg2.Error, OSError):
            self.log_error('Database or IO error during %s', self.command)
            self.reply(503, {'error': 'Opslaan is tijdelijk niet mogelijk. Jouw invoer blijft in beeld; probeer opnieuw.'})
        except Exception:
            self.log_error('Unexpected error during %s', self.command)
            self.reply(500, {'error': 'Er ging iets mis. Jouw invoer blijft in beeld; probeer opnieuw.'})
        finally:
            if connection:
                connection.close()

    def log_message(self, fmt, *args):
        # Never log Authorization headers, query strings or answer contents.
        super().log_message('%s %s', self.command, urlsplit(self.path).path)


def initialize(seed_path, access_path):
    seed = json.loads(Path(seed_path).read_text(encoding='utf-8'))
    with connect() as db:
        with db.cursor() as cur:
            cur.execute(SCHEMA)
            cur.execute('SELECT count(*) AS total FROM quiz_rounds')
            if not cur.fetchone()['total']:
                for index, item in enumerate(seed['rounds']):
                    cur.execute('INSERT INTO quiz_rounds(id,sort_order,title) VALUES(%s,%s,%s)', (item['id'], index, item['title']))
                    for question in item['questions']:
                        cur.execute('INSERT INTO quiz_questions(round_id,id,prompt,correct,alternatives,max_cents) VALUES(%s,%s,%s,%s,%s,%s)',
                            (item['id'], question['id'], question['prompt'], question.get('correct',''), Json(question.get('alternatives',[])), question['max_cents']))
    print('Pubquizdatabase geïnitialiseerd. Beheer is rechtstreeks toegankelijk via organisator.html.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--init', dest='seed')
    parser.add_argument('--access-file', default='/var/lib/pubquiz/beheerlink.txt')
    parser.add_argument('--port', type=int, default=8077)
    args = parser.parse_args()
    if args.seed:
        initialize(args.seed, args.access_file)
    else:
        with connect() as db:
            with db.cursor() as cur:
                cur.execute(SCHEMA)
        ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
