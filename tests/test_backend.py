import concurrent.futures
import hashlib
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
                cur.execute('TRUNCATE quiz_answers,quiz_questions,quiz_rounds,quiz_teams,quiz_changes')
                cur.execute("UPDATE quiz_meta SET value='0' WHERE key='revision'")
                cur.execute("INSERT INTO quiz_meta VALUES('access_hash',%s) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (hashlib.sha256(b'test-only-token').hexdigest(),))
                cur.execute("INSERT INTO quiz_rounds(id,sort_order,title) VALUES('1',0,'Test')")
                cur.execute("INSERT INTO quiz_questions(round_id,id,prompt,correct,alternatives,max_cents) VALUES('1','1','Testvraag','C) Voorbeeld','[\"Ook goed\"]',100)")
        self.tid=self.call('/teams/add',name='Testteam')['id']

    def call(self,route,**body):
        with app.connect() as db:
            with db.cursor() as cur:
                return app.mutate(cur,route,{'actor':'Testorganisator',**body})

    def save(self,**kwargs):
        return self.call('/answers/save',team_id=self.tid,round_id='1',question_id='1',**kwargs)

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

    def test_api_authentication_and_origin_boundaries(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            def request(method,path,headers=None,body=None):
                connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                connection.request(method,app.PREFIX+path,body=body,headers=headers or {})
                result=connection.getresponse();status=result.status;data=result.read();connection.close()
                return status,json.loads(data)
            self.assertEqual(request('GET','/state')[0],401)
            self.assertEqual(request('GET','/state',{'Authorization':'Bearer wrong'})[0],401)
            self.assertEqual(request('GET','/state',{'Authorization':'Bearer test-only-token','Origin':'https://example.com'})[0],403)
            self.assertEqual(request('GET','/state',{'Authorization':'Bearer test-only-token','Origin':app.ORIGIN})[0],200)
            self.assertEqual(request('POST','/teams/add',{'Authorization':'Bearer test-only-token','Content-Type':'application/json'},'{}')[0],403)
            self.assertEqual(request('GET','/health')[0],200)
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__=='__main__':
    unittest.main()
