# Coach conversation: first workflow

## Prototype before implementation

Local layout prototype: `.local/coach-chat-first/prototype.html`. Illustrative content only; it does not represent athlete data or a connected model.

## Existing capabilities to preserve

| Capability | Actual implementation / limit |
| --- | --- |
| Authenticated conversation | Owner-only `/api/assistant`, persisted messages, duplicate-send protection |
| Profile and selected-workout changes | Validated proposals, explicit selection/confirmation, revision guards and verified save receipts |
| Results | Selected session, minutes, effort, optional supported measurements; no inferred session when ambiguous |
| Whole plans, availability, races, structured steps | Existing inline commander workspace and protected writers |
| Workout and fueling | Existing canonical workout card, numerical targets where verified, pre/during/post information, held-state handling |
| Voice | Browser dictation, editable transcript, explicit send; browser-provider notice; text fallback |
| External AI | Optional OpenAI generic education only; existing runtime configuration required. No personal conversation, device data or derived context is sent. No silent provider fallback. This is not unrestricted ChatGPT dialogue. |
| Human coach | Existing request flow; no claim of Telegram reply routing or call completion |

## First implementation slice

Dedicated Coach route gets a larger conversation with a persistent composer, immediately visible dictation control, short welcome and expandable help. Existing embedded Coach remains available. A separate-window link opens the same authenticated route. Asking for today's workout or fueling opens a freshly fetched protected workout card directly in the conversation; multiple sessions require selection. Results and edits continue through existing proposals and explicit confirmation. Cards stay ephemeral in browser state and are never serialized into chat history or external model input.

## Remaining gates

A genuinely open-ended personalized AI dialogue needs a separately reviewed permitted-data architecture and model benchmark; the present external boundary is preserved. No credentials or provider flags are changed. Full real-time voice, unrestricted natural-language actions, human reply routing and actual watch delivery are not claimed by this slice. Production release follows validation and review.
