"""Only expected negative calculator results become ordinary non-winning hands."""
import json
import sys
import types
from js import browserMcrScore


class ScorerFatalError(BaseException):
    """Must bypass upstream broad except Exception handlers."""


def score(**kwargs):
    try:
        result = json.loads(browserMcrScore(json.dumps(kwargs)))
    except BaseException as error:
        raise ScorerFatalError('国标算番模块运行失败：' + str(error)) from error
    if isinstance(result, dict) and result.get('code') in (-1, -2, -3):
        raise ValueError(result.get('error', 'Invalid winning hand'))
    if not isinstance(result, list) or any(not isinstance(f, list) or len(f) != 4 for f in result):
        raise ScorerFatalError('国标算番模块返回了未知结果')
    return tuple(tuple(f) for f in result)


module = types.ModuleType('MahjongGB')
module.MahjongFanCalculator = score
sys.modules['MahjongGB'] = module
