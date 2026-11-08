import unittest
import json
import sys
import types
import importlib.util
from pathlib import Path
from browser_game import BrowserGame, BrowserAgent, browser_dispatch, choose_ai
from MahjongGB import MahjongFanCalculator
from unittest.mock import patch


class BrowserGameTests(unittest.TestCase):
    def test_auto_play_finishes_without_human_input(self):
        game = BrowserGame(42, 'play')
        for _ in range(400):
            if game.env.done:
                break
            before = len(game.actions)
            observation = game.env.obs.get(0)
            game.auto_step()
            self.assertEqual(len(game.actions), before + 1)
            if observation is not None:
                self.assertIsInstance(game.actions[-1], int)
        self.assertTrue(game.env.done)
        self.assertEqual(sum(game.view()['result']['scores']), 0)

    def test_auto_commands_replay_exactly(self):
        browser_dispatch(json.dumps({'type':'start','seed':42,'mode':'play'}))
        for _ in range(12):
            pending = json.loads(browser_dispatch('{"type":"pending"}'))
            actions = {str(item['seat']): next(i for i, legal in enumerate(item['mask']) if legal) for item in pending}
            view = json.loads(browser_dispatch(json.dumps({'type':'commit','actions':actions})))
            restored = json.loads(browser_dispatch(json.dumps({'type':'restore','replay':view['replay']})))
            self.assertEqual(view, restored)

    def test_bridge_failure_bypasses_referee_catches(self):
        fake_js = types.SimpleNamespace(browserMcrScore=lambda _: (_ for _ in ()).throw(RuntimeError('wasm trap')))
        with patch.dict(sys.modules, {'js':fake_js}):
            spec = importlib.util.spec_from_file_location('test_scorer_shim',Path(__file__).with_name('scorer_shim.py'))
            shim = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(shim)
            agent = self.make_agent('W1 W2 B3 B4 B5 T6 T7 T8 F1 F1 F1 W5 W5')
            with patch('browser_game.MahjongFanCalculator',shim.score):
                with self.assertRaises(shim.ScorerFatalError):
                    agent._check_mahjong('W3',True)
            shim.browserMcrScore = lambda _: '{"error":"ERROR_NOT_WIN","code":-3}'
            with self.assertRaises(ValueError):
                shim.score()

    def test_committed_event_logs_redact_opponent_kong(self):
        game = BrowserGame(42)
        agent = game.env.agents[0]
        agent.request2obs('Player 2 AnGang')
        self.assertEqual(game.log[-1], '竹间 暗杠')
        self.assertNotIn('CONCEALED',game.log[-1])
        self.assertTrue(game.view()['players'][2]['packs'][-1]['concealed'])
        self.assertEqual(game.view()['players'][2]['packs'][-1]['tile'],'CONCEALED')

    def test_log_uses_action_names_and_tiles(self):
        game = BrowserGame(42, 'play')
        agent = game.env.agents[0]
        agent.request2obs('Player 2 Play W3')
        self.assertEqual(game.log[-1], '竹间 出牌 三万')
        agent.request2obs('Player 3 Play J2')
        self.assertEqual(game.log[-1], '松风 出牌 发')
        agent.request2obs('Player 0 Hu')
        self.assertEqual(game.log[-1], '你 胡牌')

    def test_spectate_log_names_seat_zero_by_wind(self):
        game = BrowserGame(42, 'spectate')
        game.env.agents[0].request2obs('Player 0 Hu')
        self.assertEqual(game.log[-1], '东家 胡牌')

    def make_agent(self, tiles):
        agent = BrowserAgent(1)
        agent.request2obs('Wind 2')
        agent.request2obs('Deal ' + tiles)
        return agent

    def test_self_draw_fourth_tile_reaches_eight(self):
        agent = self.make_agent('W1 W2 B3 B4 B5 T6 T7 T8 F1 F1 F1 W5 W5')
        self.assertFalse(agent._check_mahjong('W3', True))
        agent.shownTiles['W3'] = 3
        self.assertTrue(agent._check_mahjong('W3', True))
        # Real Draw request must advertise Hu, not only a direct helper call.
        observation = agent.request2obs('Draw W3')
        self.assertEqual(observation['action_mask'][1], 1)

    def test_fourth_tile_flags_and_robbing(self):
        agent = self.make_agent('W1 W2 W3 B3 B4 B5 T6 T7 T8 F1 F1 F1 W5')
        for self_draw, kong, shown, expected in [(True,False,3,True),(False,False,4,True),(False,True,4,False),(True,False,2,False)]:
            agent.shownTiles['W5'] = shown
            with patch('browser_game.MahjongFanCalculator', wraps=MahjongFanCalculator) as score:
                agent._check_mahjong('W5',self_draw,kong)
                self.assertEqual(score.call_args.kwargs['is4thTile'], expected)

    def test_claim_and_kong_masks(self):
        # seat1 receives a discard from seat0, its upstream player.
        agent = self.make_agent('W1 W2 W3 W3 W3 B1 B2 B4 T2 T3 T4 F2 J1')
        observation = agent.request2obs('Player 0 Play W3')
        legal = set(observation['action_mask'].nonzero()[0].tolist())
        self.assertIn(agent.OFFSET_ACT['Peng']+2, legal)
        self.assertIn(agent.OFFSET_ACT['Gang']+2, legal)
        self.assertTrue(any(36 <= action < 99 for action in legal))
        agent.request2obs('Player 1 Chi W2')
        self.assertEqual(agent.packs[0][-1][0], 'CHI')
        agent = self.make_agent('W1 W1 W1 B1 B2 B3 T1 T2 T3 F2 F2 F2 J1')
        observation = agent.request2obs('Draw W1')
        self.assertEqual(observation['action_mask'][167],1)
        self.assertEqual(agent.action2response(167),'Gang W1')
        agent = self.make_agent('W1 B1 B2 B3 T1 T2 T3 F2 F2 J1')
        agent.packs[0] = [('PENG','W1',1)]
        observation = agent.request2obs('Draw F2')
        self.assertEqual(observation['action_mask'][201],1)
        self.assertEqual(agent.action2response(201),'BuGang W1')

    def test_knitted_straight_open_hand_and_chicken(self):
        agent = self.make_agent('W1 W4 W7 B2 B5 B8 T3 T6 T9 W5')
        agent.packs[0] = [('PENG','F1',1)]
        self.assertTrue(agent._check_mahjong('W5',True))
        # Regression from a real deterministic game: the original scorer
        # supplies chicken hand; it is never assigned to arbitrary shapes.
        game = BrowserGame(42,'spectate')
        while not game.env.done:
            game.step()
        self.assertTrue(any(f['name']=='无番和' for f in game.view()['result']['fans']))

    def test_full_games_and_zero_sum(self):
        for seed in range(12):
            game = BrowserGame(seed, 'spectate')
            for _ in range(400):
                if game.env.done:
                    break
                game.step()
            self.assertTrue(game.env.done, seed)
            self.assertEqual(sum(game.view()['result']['scores']), 0)
            self.assertTrue(all('hand' in p for p in game.view()['players']))

    def test_play_masks_and_privacy(self):
        game = BrowserGame(42)
        for _ in range(80):
            if game.env.done:
                break
            view = game.view()
            self.assertTrue(all('hand' not in p for p in view['players']))
            before = len(game.actions)
            game.step()
            if view['needsHuman']:
                self.assertEqual(len(game.actions), before)
                action = choose_ai(game.env.agents[0], game.env.obs[0])
                game.step(action)

    def test_replay_restores_exact_view(self):
        browser_dispatch(json.dumps({'type':'start', 'seed':42, 'mode':'spectate'}))
        for _ in range(20):
            pending = json.loads(browser_dispatch('{"type":"pending"}'))
            actions = {str(item['seat']): next(i for i, legal in enumerate(item['mask']) if legal) for item in pending}
            view = json.loads(browser_dispatch(json.dumps({'type':'commit','actions':actions})))
        restored = json.loads(browser_dispatch(json.dumps({'type':'restore', 'replay':view['replay']})))
        self.assertEqual(view, restored)

    def test_old_replay_rejected(self):
        with self.assertRaises(ValueError):
            browser_dispatch(json.dumps({'type':'restore','replay':{'seed':42,'mode':'play','actions':[]}}))

    def test_model_commit_rejects_missing_seats_and_illegal_ids(self):
        browser_dispatch(json.dumps({'type':'start','seed':42,'mode':'spectate'}))
        with self.assertRaises(ValueError):
            browser_dispatch(json.dumps({'type':'commit','actions':{}}))
        pending = json.loads(browser_dispatch('{"type":"pending"}'))
        with self.assertRaises(ValueError):
            browser_dispatch(json.dumps({'type':'commit','actions':{str(item['seat']):999 for item in pending}}))

    def test_invalid_action_rejected(self):
        game = BrowserGame(42)
        with self.assertRaises(ValueError):
            game.step(999)


if __name__ == '__main__':
    unittest.main()
