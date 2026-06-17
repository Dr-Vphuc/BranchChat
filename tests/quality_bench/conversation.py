"""Assemble the message array sent to the model for one trial.

Mirrors how the app builds context: a branch-chat node sees only its ancestor
chain, so a *clean* run is just ``[user: target]``. A *linear* run is what a
single-thread chat sends — the same target preceded by ``k`` off-topic Q+A turns
that, in the app, would have lived on a different branch.

The system instruction is held separately (the backend folds it into Gemini's
``system_instruction``); see SYSTEM below.
"""

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

Turn = Tuple[str, str]
Message = Dict[str, str]

SYSTEM = (
    "You are a careful math tutor. Solve the user's math problem step by step, "
    "then end your reply with a line in exactly this form: 'The answer is N.' "
    "where N is the final number."
)


def build_messages(target_question: str, distractors: Sequence[Turn] = ()) -> List[Message]:
    """``distractors`` empty → clean (branch). Otherwise the k pairs precede the target."""
    messages: List[Message] = []
    for user_q, assistant_a in distractors:
        messages.append({"role": "user", "content": user_q})
        messages.append({"role": "assistant", "content": assistant_a})
    messages.append({"role": "user", "content": target_question})
    return messages
