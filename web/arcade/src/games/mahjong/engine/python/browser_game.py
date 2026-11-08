"""Browser orchestration, using vendored competition engine, mask and shanten code."""
import json
import random
import numpy as np
from feature import FeatureAgent
from env_fixed import MahjongGBEnvFixed
from MahjongGB import MahjongFanCalculator
from feature_v1 import judge_fan_total
from shanten_py import regular_shanten_useful, seven_pairs_shanten_useful, thirteen_orphans_shanten_useful


SEAT_NAMES = {
    'play': ('你', '月白', '竹间', '松风'),
    'spectate': ('东家', '月白', '竹间', '松风'),
}
ACTION_NAMES = {
    'Play': '出牌',
    'Chi': '吃',
    'Peng': '碰',
    'Gang': '杠',
    'AnGang': '暗杠',
    'BuGang': '补杠',
    'Hu': '胡牌',
}
SUIT_NAMES = {'W': '万', 'T': '条', 'B': '筒'}
HONOR_NAMES = {'F1': '东', 'F2': '南', 'F3': '西', 'F4': '北', 'J1': '中', 'J2': '发', 'J3': '白'}
NUMERALS = '一二三四五六七八九'


def tile_label(code):
    if code in HONOR_NAMES:
        return HONOR_NAMES[code]
    suit, number = code[:1], code[1:]
    if suit in SUIT_NAMES and number.isdigit() and 1 <= int(number) <= 9:
        return NUMERALS[int(number) - 1] + SUIT_NAMES[suit]
    return code


def event_label(request, mode='play'):
    """Turn a referee request such as 'Player 1 Play W3' into '月白 出牌 三万'."""
    words = request.split()
    if len(words) < 3 or words[0] != 'Player':
        return None
    action = ACTION_NAMES.get(words[2])
    if action is None:
        return None
    try:
        seat = int(words[1])
    except ValueError:
        return None
    names = SEAT_NAMES.get(mode, SEAT_NAMES['play'])
    name = names[seat] if 0 <= seat < len(names) else '玩家%d' % (seat + 1)
    parts = [name, action]
    if len(words) > 3:
        parts.append(tile_label(words[3]))
    return ' '.join(parts)


class BrowserAgent(FeatureAgent):
    def request2obs(self, request):
        if 'Invalid' in request:
            raise RuntimeError('Rules engine rejected an advertised legal action: ' + request)
        result = super().request2obs(request)
        # Referee notifications represent committed events, unlike AI intents.
        # Agent 0 receives hidden opponent kongs without a tile identifier.
        sink = getattr(self, 'event_sink', None)
        if sink is not None and request.startswith('Player '):
            words = request.split()
            if words[2] != 'Draw':
                sink(request)
        return result

    def _check_mahjong(self, winTile, isSelfDrawn=False, isAboutKong=False):
        # Align the author's public mask with the corrected referee: the scorer
        # is the same original C++ source as the WASM judge, not a hand-shape test.
        try:
            fans = MahjongFanCalculator(pack=tuple(self.packs[0]), hand=tuple(self.hand),
                winTile=winTile, flowerCount=0, isSelfDrawn=isSelfDrawn,
                is4thTile=(self.shownTiles[winTile] == (3 if isSelfDrawn else 4)
                    and not (isAboutKong and not isSelfDrawn)),
                isAboutKong=isAboutKong, isWallLast=self.wallLast,
                seatWind=self.seatWind, prevalentWind=self.prevalentWind, verbose=True)
            return judge_fan_total(fans, winTile, self.hand) >= 8
        except Exception:
            return False


class BrowserEnv(MahjongGBEnvFixed):
    def _checkMahjong(self, player, isSelfDrawn=False, isAboutKong=False):
        super()._checkMahjong(player, isSelfDrawn, isAboutKong)
        self.browser_winner = player
        shown = self.shownTiles[self.curTile] - int(isSelfDrawn or isAboutKong)
        self.browser_fans = MahjongFanCalculator(pack=tuple(self.packs[player]),
            hand=tuple(self.hands[player]), winTile=self.curTile, flowerCount=0,
            isSelfDrawn=isSelfDrawn, is4thTile=(shown + isSelfDrawn) == 4,
            isAboutKong=isAboutKong, isWallLast=self.wallLast,
            seatWind=player, prevalentWind=self.prevalentWind, verbose=True)


def choose_ai(agent, observation):
    """Only one player's public observation and own FeatureAgent enter policy."""
    legal = np.flatnonzero(observation['action_mask']).tolist()
    if 1 in legal:
        return 1
    discards = [a for a in legal if 2 <= a < 36]
    if discards:
        hand = list(agent.hand)
        def rank(action):
            rest = hand.copy()
            rest.remove(agent.TILE_LIST[action - 2])
            results = [regular_shanten_useful(rest)]
            if not agent.packs[0]:
                results.extend((seven_pairs_shanten_useful(rest), thirteen_orphans_shanten_useful(rest)))
            best = min(results, key=lambda r: (r[0], -len(r[1])))
            return (best[0], -len(best[1]), action)
        return min(discards, key=rank)
    # Existing masks decide claims; prefer kongs/pungs, keep chows optional.
    claims = [a for a in legal if a >= 99]
    return max(claims) if claims else (0 if 0 in legal else legal[0])


class BrowserGame:
    def __init__(self, seed=None, mode='play'):
        self.seed = seed
        self.mode = mode
        self.actions = []
        self.env = BrowserEnv({'agent_clz': BrowserAgent, 'duplicate': True})
        rng = random.Random(seed)
        tiles = FeatureAgent.TILE_LIST * 4
        rng.shuffle(tiles)
        self.env.reset(prevalentWind=rng.randrange(4), tileWall=' '.join(tiles))
        self.log = ['新牌局：136 张无花，复式国标，8 番起和。']
        self.env.agents[0].event_sink = self._record_event

    def _record_event(self, request):
        line = event_label(request, self.mode)
        if line:
            self.log.append(line)

    def step(self, action=None):
        env = self.env
        if env.done:
            return self.view()
        human = env.obs.get(0)
        human_legal = [] if human is None else np.flatnonzero(human['action_mask']).tolist()
        if self.mode == 'play' and action is None and any(a != 0 for a in human_legal):
            return self.view()
        if action is not None and action not in human_legal:
            raise ValueError('当前不可执行此动作')
        actions = {}
        for seat, observation in env.obs.items():
            chosen = (action if action is not None else 0) if seat == 0 and self.mode == 'play' else choose_ai(env.agents[seat], observation)
            actions[env.agent_names[seat]] = chosen
        env.step(actions)
        self.actions.append(action)
        return self.view()

    def auto_step(self):
        observation = self.env.obs.get(0)
        if self.mode == 'play' and not self.env.done and observation is not None:
            return self.step(choose_ai(self.env.agents[0], observation))
        return self.step()

    def view(self):
        env = self.env
        agent = env.agents[0]
        observation = env.obs.get(0)
        legal = [] if env.done or observation is None else np.flatnonzero(observation['action_mask']).tolist()
        labels = {'Pass': '过', 'Hu': '胡', 'Play': '出牌', 'Chi': '吃', 'Peng': '碰', 'Gang': '杠', 'BuGang': '补杠'}
        actions = []
        for action in legal:
            response = agent.action2response(action).split()
            entry = {'id': action, 'label': labels[response[0]]}
            if len(response) > 1:
                entry['tile'] = response[1]
            elif response[0] in ('Peng', 'Gang'):
                entry['tile'] = env.curTile
            actions.append(entry)
        players = []
        for seat in range(4):
            # FeatureAgent 0 already redacts opponent concealed kongs.
            packs = [{'type': p[0], 'tile': p[1], 'offer': p[2], 'concealed': p[1] == 'CONCEALED' or (p[0] == 'GANG' and p[2] == 0)} for p in agent.packs[seat]]
            players.append({'seat': seat, 'handCount': len(env.agents[seat].hand), 'discards': list(agent.history[seat]), 'packs': packs})
            if self.mode == 'spectate':
                players[-1]['hand'] = list(env.agents[seat].hand)
                players[-1]['packs'] = [{'type':p[0], 'tile':p[1], 'offer':p[2], 'concealed':p[0]=='GANG' and p[2]==0} for p in env.packs[seat]]
        result = None
        if env.done:
            result = {'winner': getattr(env, 'browser_winner', None), 'scores': env.reward,
                'fans': [{'name': f[2], 'points': f[0], 'count': f[1]} for f in getattr(env, 'browser_fans', [])]}
        return {'replay': {'seed':self.seed,'mode':self.mode,'actions':self.actions.copy()}, 'phase': 'finished' if env.done else 'playing', 'hand': sorted(agent.hand, key=agent.OFFSET_TILE.get),
            'players': players, 'currentPlayer': env.curPlayer, 'remaining': sum(map(len, env.tileWall)),
            'wind': env.prevalentWind, 'actions': actions, 'needsHuman': self.mode == 'play' and any(a != 0 for a in legal),
            'result': result, 'log': self.log[-12:]}


game = None
def browser_dispatch(command_json):
    global game
    command = json.loads(command_json)
    if command['type'] == 'start':
        game = BrowserGame(command.get('seed'),command.get('mode','play'))
        return json.dumps(model_view())
    if command['type'] == 'restore':
        replay = command['replay']
        if replay.get('policy') != 'kdens3-v1' or len(replay['actions']) > 1000:
            raise ValueError('Legacy replay is incompatible with kdens3; discard the saved game to start')
        game = BrowserGame(replay['seed'], replay['mode'])
        for actions in replay['actions']:
            commit_actions(actions)
        return json.dumps(model_view())
    if game is None:
        raise RuntimeError('Invalid game command')
    if command['type'] == 'pending':
        return json.dumps([{'seat': seat, 'obs': np.asarray(obs['observation'], dtype=np.float32).reshape(-1).tolist(), 'mask': np.asarray(obs['action_mask'], dtype=bool).tolist()} for seat, obs in game.env.obs.items()] if not game.env.done else [])
    if command['type'] == 'commit':
        commit_actions(command['actions'])
        return json.dumps(model_view())
    raise ValueError('Invalid game command')


def commit_actions(actions):
    if game.env.done:
        raise ValueError('Game finished')
    expected = {str(seat) for seat in game.env.obs}
    if set(actions) != expected:
        raise ValueError('Invalid model actions')
    chosen = {}
    for seat, observation in game.env.obs.items():
        action = actions[str(seat)]
        if type(action) is not int or not 0 <= action < 235 or not observation['action_mask'][action]:
            raise ValueError('Invalid model actions')
        chosen[game.env.agent_names[seat]] = action
    game.env.step(chosen)
    game.actions.append(actions)


def model_view():
    view = game.view()
    view['replay']['policy'] = 'kdens3-v1'
    return view
