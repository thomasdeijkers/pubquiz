import concurrent.futures
import http.client
import json
import os
import sys
import threading
import unittest
import uuid
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import app


class QuizTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if 'pubquiz_test' not in app.DSN:
            raise RuntimeError('Tests mogen alleen op de afzonderlijke pubquiz_test database draaien.')
        with app.connect() as db:
            with db.cursor() as cur:
                cur.execute(app.SCHEMA)

    def setUp(self):
        with app.connect() as db:
            with db.cursor() as cur:
                cur.execute("DELETE FROM quiz_meta WHERE key='current_round'")
                cur.execute('TRUNCATE quiz_answers,quiz_questions,quiz_rounds,quiz_teams,quiz_changes')
                cur.execute("UPDATE quiz_meta SET value='0' WHERE key IN ('revision','answers_epoch')")
                cur.execute("INSERT INTO quiz_rounds(id,sort_order,title) VALUES('1',0,'Test')")
                cur.execute("INSERT INTO quiz_questions(round_id,id,prompt,correct,alternatives,max_cents) VALUES('1','1','Testvraag','C) Voorbeeld','[\"Ook goed\"]',100)")
        self.tid=self.call('/teams/add',name='Testteam')['id']

    def call(self,route,**body):
        with app.connect() as db:
            with db.cursor() as cur:
                return app.mutate(cur,route,{'actor':'Testorganisator',**body})

    def save(self,**kwargs):
        return self.call('/answers/save',team_id=self.tid,round_id='1',question_id='1',**kwargs)

    def test_current_round_shared_without_changing_scores(self):
        self.save(version=0,answer='Voorbeeld',points=1)
        self.call('/rounds/current',round_id='1')
        with app.connect() as db:
            with db.cursor() as cur:
                self.assertEqual(app.state(cur)['current_round'],'1')
                public=app.standings_state(cur)
                self.assertEqual(public['current_round'],'1')
                self.assertEqual(public['answers'][0]['points_cents'],100)
        with self.assertRaises(app.Problem):
            self.call('/rounds/current',round_id='onbekend')
        self.call('/rounds/current',round_id='')
        with app.connect() as db:
            with db.cursor() as cur:
                self.assertEqual(app.standings_state(cur)['current_round'],'')

    def test_members_are_separate_and_preserved_by_older_team_updates(self):
        added=self.call('/teams/add',name='Berggeiten',members=' Anna\nBram ')
        self.call('/teams/update',id=self.tid,version=1,members='Claudine\nPim')
        self.save(version=0,answer='Voorbeeld',points=1)
        self.call('/teams/update',id=self.tid,version=2,name='Nieuwe teamnaam')
        self.call('/teams/update',id=self.tid,version=3,active=False)
        self.call('/teams/update',id=self.tid,version=4,active=True)
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
                public=app.standings_state(cur)
        teams={str(row['id']):row for row in snapshot['teams']}
        self.assertEqual(teams[self.tid]['members'],'Claudine\nPim')
        self.assertEqual(teams[self.tid]['name'],'Nieuwe teamnaam')
        self.assertEqual(teams[added['id']]['members'],'Anna\nBram')
        self.assertEqual(snapshot['answers'][0]['points_cents'],100)
        self.assertTrue(all('members' not in row for row in public['teams']))
        self.call('/teams/update',id=self.tid,version=5,members='')
        with self.assertRaises(app.Problem) as stale:
            self.call('/teams/update',id=self.tid,version=5,members='Oude invoer')
        self.assertEqual(stale.exception.status,409)

    def test_members_reject_invalid_values_without_changing_team(self):
        for value in [None,[], 'x'*2001]:
            with self.subTest(value=type(value).__name__):
                with self.assertRaises(app.Problem):
                    self.call('/teams/update',id=self.tid,version=1,members=value)
        self.call('/teams/update',id=self.tid,version=1,members='Geldig lid')

    def test_delete_active_or_excluded_team_removes_only_its_answers(self):
        self.save(version=0,answer='Bewaard antwoord',points=1)
        for active in [True,False]:
            with self.subTest(active=active):
                target=self.call('/teams/add',name=f'Te verwijderen {active}',members='Een lid')['id']
                self.call('/answers/save',team_id=target,round_id='1',question_id='1',version=0,answer='Antwoord',points=1)
                if not active:
                    self.call('/teams/update',id=target,version=1,active=False)
                self.call('/teams/delete',id=target,version=1 if active else 2)
                with app.connect() as db:
                    with db.cursor() as cur:
                        snapshot=app.state(cur)
                self.assertNotIn(target,[str(team['id']) for team in snapshot['teams']])
                self.assertEqual(len(snapshot['answers']),1)
                self.assertEqual(str(snapshot['answers'][0]['team_id']),self.tid)
                self.assertEqual(snapshot['answers'][0]['points_cents'],100)
                self.assertEqual(snapshot['changes'][0]['action'],'Team verwijderd')

    def test_stale_delete_keeps_team_and_answers(self):
        self.save(version=0,answer='Behouden',points=1)
        self.call('/teams/update',id=self.tid,version=1,members='Nieuw lid')
        with self.assertRaises(app.Problem) as stale:
            self.call('/teams/delete',id=self.tid,version=1)
        self.assertEqual(stale.exception.status,409)
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
        self.assertEqual(len(snapshot['teams']),1)
        self.assertEqual(len(snapshot['answers']),1)

    def test_bingo_card_is_saved_and_preserved_when_updating_other_team_fields(self):
        target=self.call('/teams/add',name='Bingo team',bingo_card='2')['id']
        self.call('/teams/update',id=target,version=1,members='Anna')
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
        item=next(team for team in snapshot['teams'] if str(team['id'])==target)
        self.assertEqual(item['bingo_card'],2)
        self.call('/teams/update',id=target,version=2,bingo_card='3')
        self.call('/teams/update',id=target,version=3,bingo_card='')
        for bad in [0,4,True,'K1',{}]:
            with self.subTest(bad=bad):
                with self.assertRaises(app.Problem):
                    self.call('/teams/update',id=target,version=4,bingo_card=bad)

    def test_reset_requires_exact_password_and_clears_only_answers(self):
        self.save(version=0,answer='Voorbeeld',points=1)
        self.call('/rounds/status',id='1',version=1,closed=True)
        for password in ['', 'Pubquiz', 'pubquiz ', None]:
            with self.subTest(password=password):
                with self.assertRaises(app.Problem):
                    self.call('/answers/reset',password=password)
        with app.connect() as db:
            with db.cursor() as cur:
                before=app.state(cur)
        self.assertEqual(len(before['answers']),1)
        result=self.call('/answers/reset',password='pubquiz')
        self.assertEqual(result['deleted'],1)
        with app.connect() as db:
            with db.cursor() as cur:
                after=app.state(cur)
        self.assertEqual(after['answers'],[])
        self.assertEqual(after['teams'],before['teams'])
        self.assertEqual(after['questions'],before['questions'])
        self.assertFalse(after['rounds'][0]['closed'])
        self.assertGreater(after['rounds'][0]['version'],before['rounds'][0]['version'])
        self.assertEqual(after['answers_epoch'],1)
        self.assertEqual(after['changes'][0]['action'],'Alle antwoorden gereset')

    def test_reset_prevents_an_old_blank_draft_from_restoring_answers(self):
        self.call('/answers/reset',password='pubquiz')
        with self.assertRaises(app.Problem) as stale:
            self.save(version=0,answer='Oud concept',points=1)
        self.assertEqual(stale.exception.status,409)
        with self.assertRaises(app.Problem):
            self.call('/answers/match',round_id='1',team_id=self.tid)
        with self.assertRaises(app.Problem):
            self.call('/answers/reset',password='pubquiz')
        saved=self.save(version=0,answer='Nieuwe invoer',points=1,answers_epoch=1)
        self.assertEqual(saved['points_cents'],100)

    def test_fractional_points_and_answer_change_invalidates_old_grade(self):
        first=self.save(version=0,answer='Een antwoord',points=0.5)
        self.assertEqual(first['points_cents'],50)
        updated=self.save(version=first['version'],answer='Een ander antwoord')
        self.assertIsNone(updated['points_cents'])

    def test_no_negative_nan_or_excessive_points(self):
        for number in [-1,float('nan'),0.001,2]:
            with self.subTest(number=number):
                with self.assertRaises(app.Problem):
                    self.save(version=0,answer='Test',points=number)

    def test_stale_version_never_silently_overwrites(self):
        self.save(version=0,answer='Eerste',points=1)
        with self.assertRaises(app.Problem) as conflict:
            self.save(version=0,answer='Tweede',points=0)
        self.assertEqual(conflict.exception.status,409)
        self.assertEqual(conflict.exception.extra['current']['answer'],'Eerste')

    def test_concurrent_saves_have_one_winner(self):
        def attempt(value):
            try:
                self.save(version=0,answer=value,points=1)
                return 200
            except app.Problem as error:
                return error.status
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=list(pool.map(attempt,['Eerste','Tweede']))
        self.assertEqual(sorted(outcomes),[200,409])

    def test_close_requires_every_active_team_to_be_graded(self):
        with self.assertRaises(app.Problem):
            self.call('/rounds/status',id='1',version=1,closed=True)
        self.save(version=0,answer='Test',points=0)
        self.call('/rounds/status',id='1',version=1,closed=True)
        with self.assertRaises(app.Problem):
            self.save(version=1,answer='Aanpassing',points=1)
        self.call('/rounds/status',id='1',version=2,closed=False)
        self.save(version=1,answer='Aanpassing',points=1)

    def test_round_close_race_with_an_answer_is_serialized(self):
        self.save(version=0,answer='Voorbeeld',points=1)
        def close_round():
            return self.call('/rounds/status',id='1',version=1,closed=True)
        def edit_answer():
            try:
                return self.save(version=1,answer='Gewijzigd',points=0)
            except app.Problem:
                return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=[pool.submit(close_round),pool.submit(edit_answer)]
            [future.result() for future in outcomes]
        with app.connect() as db:
            with db.cursor() as cur:
                cur.execute("SELECT closed FROM quiz_rounds WHERE id='1'")
                self.assertTrue(cur.fetchone()['closed'])

    def test_auto_matching_accepts_choice_letter_and_leaves_unmatched_pending(self):
        self.save(version=0,answer='C')
        self.assertEqual(self.call('/answers/match',team_id=self.tid,round_id='1')['matched'],1)
        updated=self.save(version=2,answer='Onbekend')
        self.assertIsNone(updated['points_cents'])
        self.assertEqual(self.call('/answers/match',team_id=self.tid,round_id='1')['matched'],0)

    def test_cannot_change_maximum_after_grading(self):
        self.save(version=0,answer='Voorbeeld',points=1)
        with self.assertRaises(app.Problem):
            self.call('/questions/save',round_id='1',id='1',version=1,prompt='Testvraag',correct='Voorbeeld',max_points=2)

    def test_archiving_is_reversible_and_preserves_answers(self):
        self.save(version=0,answer='Bewaren',points=1)
        self.call('/teams/update',id=self.tid,version=1,active=False)
        self.call('/teams/update',id=self.tid,version=2,active=True)
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
        self.assertEqual(snapshot['answers'][0]['answer'],'Bewaren')
        self.assertEqual(snapshot['revision'],4)

    def scoring(self,maximum,mode='keep',qversion=1):
        return self.call('/settings/scoring',round_id='1',existing_scores=mode,questions=[{'id':'1','version':qversion,'max_points':maximum}])

    def test_scoring_settings_preserve_scores_and_invalidate_stale_drafts(self):
        self.save(version=0,answer='Voorbeeld',points=0.5)
        self.scoring(2)
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
        self.assertEqual(snapshot['questions'][0]['max_cents'],200)
        self.assertEqual(snapshot['answers'][0]['points_cents'],50)
        with self.assertRaises(app.Problem):
            self.save(version=1,answer='Oude invoer',points=1)

    def test_scoring_settings_scale_partial_scores_and_leave_unreviewed_pending(self):
        self.save(version=0,answer='Voorbeeld',points=0.25)
        other=self.call('/teams/add',name='Nog niet nagekeken')['id']
        self.call('/answers/save',team_id=other,round_id='1',question_id='1',version=0,answer='Concept')
        self.scoring(2.5,'scale')
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.state(cur)
        answers={str(answer['team_id']):answer for answer in snapshot['answers']}
        self.assertEqual(answers[self.tid]['points_cents'],63)
        self.assertIsNone(answers[other]['points_cents'])

    def test_scoring_settings_cannot_retain_scores_above_new_maximum(self):
        self.save(version=0,answer='Voorbeeld',points=1)
        with self.assertRaises(app.Problem):
            self.scoring(0.5)
        self.scoring(0.5,'scale')
        with app.connect() as db:
            with db.cursor() as cur:
                self.assertEqual(app.state(cur)['answers'][0]['points_cents'],50)

    def test_scoring_settings_zero_maximum_cannot_be_scaled_after_grading(self):
        self.scoring(0)
        self.save(version=0,answer='Voorbeeld',points=0)
        with self.assertRaises(app.Problem):
            self.scoring(2,'scale',qversion=2)

    def test_scoring_settings_stale_or_locked_round_is_rejected(self):
        self.scoring(2)
        with self.assertRaises(app.Problem):
            self.scoring(3)
        self.save(version=0,answer='Voorbeeld',points=2)
        self.call('/rounds/status',id='1',version=1,closed=True)
        with self.assertRaises(app.Problem):
            self.scoring(3,qversion=2)

    def test_scoring_settings_validate_whole_round_before_applying(self):
        with self.assertRaises(app.Problem):
            self.call('/settings/scoring',round_id='1',questions=[{'id':'1','version':1,'max_points':4},{'id':'999','version':1,'max_points':2}])
        with app.connect() as db:
            with db.cursor() as cur:
                self.assertEqual(app.state(cur)['questions'][0]['max_cents'],100)

    def test_public_standings_contains_scores_without_answers_or_audit(self):
        self.save(version=0,answer='Teamantwoord',points=0.5)
        with app.connect() as db:
            with db.cursor() as cur:
                snapshot=app.standings_state(cur)
        self.assertEqual(snapshot['answers'][0]['points_cents'],50)
        self.assertEqual(set(snapshot['answers'][0]),{'team_id','round_id','question_id','points_cents'})
        self.assertEqual(set(snapshot['questions'][0]),{'round_id','id'})
        self.assertNotIn('changes',snapshot)
        self.assertNotIn('bingo',snapshot)

    def test_api_open_access_and_origin_boundaries(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            def request(method,path,headers=None,body=None):
                connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                connection.request(method,app.PREFIX+path,body=body,headers=headers or {})
                result=connection.getresponse();status=result.status;data=result.read();connection.close()
                return status,json.loads(data)
            self.assertEqual(request('GET','/state')[0],200)
            self.assertEqual(request('GET','/standings')[0],200)
            self.assertEqual(request('GET','/state',{'Origin':'https://example.com'})[0],403)
            self.assertEqual(request('GET','/state',{'Origin':app.ORIGIN})[0],200)
            self.assertEqual(request('POST','/teams/add',{'Content-Type':'application/json'},'{}')[0],403)
            self.assertEqual(request('POST','/teams/add',{'Origin':app.ORIGIN,'Content-Type':'application/json'},json.dumps({'actor':'Organisator','name':'Zonder inlog'}))[0],200)
            self.assertEqual(request('GET','/health')[0],200)
            self.assertEqual(request('GET','/media/unknown.png',{'Origin':app.ORIGIN})[0],404)
            self.assertEqual(request('GET','/media/dj-oud.png',{'Origin':app.ORIGIN})[0],404)
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__=='__main__':
    unittest.main()
