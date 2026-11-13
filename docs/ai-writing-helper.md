# The AI writing helper

How the Leash Log writes with AI: what each piece does, where it lives, why it's built the way it is, and what was tried
and dropped. Written after the feature was built (Nov. 12, 2026), for whoever works on it next.

## Two ways in

- **The sparkle** on a text field (or on the keyboard toolbar of a rich field) tidies that one field's text: one
  paragraph, Mike's voice kept, spelling and the style rules fixed, nothing added.
- **Write with AI** on the Update and Blog post pages turns everything written on a walk (one big "Your notes" box, plus
  photos with rough captions) into a whole post: title, summary, paragraphs and a caption for each photo. It's the first
  option of the switch (**Write with AI | Write it myself**) and where a new or cleared post starts. Filling in moves the
  post to Write it myself, for checking. (It was called Walk notes; the code still says `walk` and `WalkNotes`.)

## Two platforms

- **iPhone app** (`canKeepToken` is true in `src/platform/secrets.native.js`): both ways in send the prompt to a model
  on [OpenRouter](https://openrouter.ai) with Mike's key, and put the reply straight in.
- **Claude app** (the web build, `secrets.web.js`): no key and no outside requests, so both ways in copy the prompt to
  paste into Claude, Copilot or Gemini; Write with AI then takes the whole reply pasted back and **Fill in** reads it.
- On the iPhone **without a key**, the sparkle falls back to copying, and Write with AI says to add a key in Settings.

## Files

| File                             | What it holds                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/writingPrompt.js`       | Both prompts: `writingPrompt` (sparkle) and `walkPrompt` (Write with AI), the shared style guide, the length curve (`walkTarget`) |
| `src/lib/walkReply.js`           | `parseWalkReply`: reads Write with AI's tagged reply, forgiving about what chat apps do to it                                     |
| `src/services/openrouter.js`     | `MODELS`, `DEFAULT_MODEL`, `modelOf`, `askModel`, `checkKey`, price helpers (`pricesFrom`, `priceText`)                           |
| `src/services/modelPrices.js`    | The day's prices from OpenRouter, cached on the phone like `weather.js`                                                           |
| `src/platform/secrets.native.js` | The OpenRouter key in the Keychain (`saveAIKey`, `readAIKey`, `removeAIKey`)                                                      |
| `src/state/desk.js`              | `aiKeyInfo` (last 4 characters, credit limit) and `aiModel` (the chosen default), persisted                                       |
| `src/components/WalkNotes.js`    | Write with AI: the switch, the notes box, the split button, Stop, filling in                                                      |
| `src/components/ui.js`           | `Field` (the sparkle, its Undo) and `SplitButton`                                                                                 |
| `src/components/RichScope.js`    | The keyboard toolbar's sparkle for rich fields (calls the same `copyPrompt`)                                                      |
| `src/screens/SettingsScreen.js`  | The OpenRouter panel (key, model picker) and the AI prompts panel (share as zip, clear)                                           |
| `src/lib/promptLog.js`           | Every prompt kept as test data, with the model, reply and cost when it was sent                                                   |

## The prompts

Both are plain text built in `writingPrompt.js`. Changing that file changes `PROMPT_VERSION` (the short hash of its last
commit, `scripts/promptVersion.cjs`), which each kept prompt records.

- **Sparkle** (`writingPrompt(writes, text, context, alone)`): "Tidy this up into {writes}", the voice and
  no-invention rules, the style guide, the rest of the post with `▶ HERE` where the text goes, then the text. `alone`
  asks for the paragraph by itself (what the iPhone sends and what's kept); without it, the prompt asks for it twice,
  readable and in a code block, for copying out of chat apps.
- **Write with AI** (`walkPrompt({ kind, standardTitle, notes, captions }, alone)`): asks for `TITLE:` (or `TITLE: keep`
  for an update's standard date title), `SUMMARY:`, `PARAGRAPH:` and `PHOTO n:` lines, one item per line. Captions are
  rewritten from scratch. Unlike the sparkle, it's an editor: it may rewrite freely, but never invent.
- **Length slides with the notes** (`walkTarget`): 200 × (1 − e^(−words ÷ 225)), to the nearest 5, at most 120. So 80
  words of notes → about 60, 120 → 85, 160 → 100, 200 or more → 120. Notes of 30 words or less (`SHORT_NOTES`) get
  different wording: keep everything and just tidy it; the "interesting / boring" paragraph is left out. Haiku hits the
  targets within about 5 words. Short notes can come back longer than written (26 words became 63), because the summary
  and paragraph repeat each other.
- **Style guide** (`STYLE_GUIDE`), shared by both: span numbers lowercase, girders vs spans, "SkyTrain", "176 St" with no
  "th", official station names, "a.m." and "p.m.". A slash is a support only for consecutive numbers ("70/71"); with
  105 or more it's progress: "span 39/105" means span 39 of 105. That rule was added after Haiku called "39/105" the
  support where spans 39 and 105 meet.

## Asking a model

`askModel({ key, model, prompt, signal })` in `openrouter.js`:

- One user message, `max_tokens: 8000`, `usage: { include: true }`. Returns `{ text, cost }`, cost in dollars.
- The budget is high on purpose: reasoning models count their thinking against it, and with 4,000 some (GLM 5.3 Flash,
  the Qwen Flash models) thought until they ran out and wrote nothing.
- **No reasoning effort is sent**, so each model thinks as much as its own default. See "Reasoning effort" below.
- Errors are `OpenRouterError`s with plain words and a `code`: `offline`, `rejected` (401/403), `no_credit` (402),
  `failed`, `empty` (no text; "ran out of room thinking" when `finish_reason` is `length`; carries its `cost`, since the
  thinking is still charged), `stopped`.
- `signal` cancels it. Write with AI's split button turns its arrow into **Stop** while it runs, and leaving the screen
  aborts too. A stopped request shows no error. The sparkle has no Stop yet.

Write with AI fills in from the reply with `parseWalkReply`. A reply it can't read leaves the post alone and lists why;
one it can read but with gaps (no `TITLE`, a photo left out) fills in and lists the gaps in the "Filled in by AI" notice.
When the post already has text, it asks before replacing it.

The sparkle turns any line breaks in the reply into spaces, puts it in the field and shows **Undo** under it. Typing in
the field drops Undo, so it can't throw away newer typing.

## Models

`MODELS` in `openrouter.js`, in the order Settings and the split button list them:

| Model              | Price per million tokens, in / out | Role                                                                                 |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Haiku 5.5   | $0.10 / $0.50                      | **Default** (`DEFAULT_MODEL`): fastest and steadiest, closest to Mike's voice        |
| Claude Sonnet 5.5  | $2.00 / $10.00                     | Premium retry: best hooks and headlines, can run long                                |
| GPT-6 Luna         | $0.10 / $0.50                      | Cheapest in practice (thinks least); sometimes cuts too much, misses "th" on streets |
| GPT-6.1 Sol        | $2.00 / $10.00                     | Premium retry: good judgment, best at the style rules, half Sonnet's cost            |
| MiniMax M3.1 Flash | $0.15 / $0.60                      | Quick on tidy-ups, variable on Walk notes (5 to 27 s)                                |

- Settings picks the default (`desk.aiModel`). The split button's main part writes with it; its menu writes once with
  any other model without changing the default.
- `modelOf(id)` falls back to the default when a saved choice is no longer in `MODELS`. Settings then shows none ticked.
- Real costs per Walk notes post, from the tests: Luna ~$0.0006, Haiku ~$0.0013, MiniMax ~$0.0016, Sol ~$0.009, Sonnet
  ~$0.018. A tidy-up is about a quarter of that. Thinking is most of every bill.
- The prices in `MODELS` are only a fallback (MiniMax's still says $0.07 / $0.30 from before it doubled on Nov. 12).
  What shows is `modelPrices.js`'s: OpenRouter's public `/api/v1/models` list, fetched at most once a day when Settings
  or Write with AI opens, kept on the phone. A model OpenRouter stops listing shows "No longer on OpenRouter".

### Tried and dropped

All tested on the kept prompts and on prompts built from molund/omc5's `status.yaml` (published posts, deliberately
roughened: "Skytrain", "Span 36", "176th St", "AM", missing apostrophes, a typo).

- **Kimi K3** ($16 per million out, reasoning) and **Claude Sonnet 4.6** ($3 / $15): too expensive for a default.
- **Gemini 3.8 Flash**: dropped for price. **Gemini 2.5 Flash Lite**: made things up (named the extension after "the
  fellow who used to run the transit authority").
- **Ling 3.0 Flash**: barely edited; left "my pictured" and "AM". Text only.
- **Qwen3.7 Flash**, **Qwen3.8 Flash**, **GLM 5.3 Flash**: mostly thought until they ran out of tokens and wrote nothing,
  and were the slowest (median 55 to 81 s on Walk notes). With low effort Qwen3.7 made things up; GLM refuses to turn
  thinking off.
- **DeepSeek V4.1 Flash 1017**: slowest and costliest of the cheap ones (~4,600 thinking tokens a post).
- **MiMo-V2.6-Flash**: unpredictable. With no effort it answered in 1 s once and thought 1,300 tokens another time;
  asking for low effort made it take 32 s.
- **Claude Opus 5.5** ($4 / $20) was not tested: about 5 cents a post.

Every model passed the tidy-ups; Write with AI is what separates them.

### Reasoning effort

OpenRouter takes `reasoning: { effort }` (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`; roughly 0, 10,
20, 50, 80 and 95% of `max_tokens` for thinking) or an exact `reasoning: { max_tokens }`. Tested on the 4 kept prompts:

- Higher effort never improved anything. Haiku at `high` cost 65% more, was slower and merged two paragraphs.
- Haiku follows it exactly: `low` was about 20% cheaper with the same quality. Not worth the complexity yet.
- Luna already thinks little; only `high` changed it (doubling cost and time).
- MiniMax got about twice as fast with any setting but made up content twice.
- So nothing is sent. If it's ever added, it belongs in `askModel`, per model.

## The key

- Pasted in Settings → OpenRouter. **Check and save** calls `checkKey`: it must start `sk-or-`, then
  `GET /api/v1/key` must accept it. That reply's `limit` and `limit_remaining` are shown as the credit left.
- Kept in the iPhone's Keychain, this device only, **without** Face ID (unlike the GitHub token, which asks every push):
  a writing request isn't worth a Face ID prompt. A credit limit on the key, set on OpenRouter, is what caps spending;
  Settings warns when the key has none.
- Only `aiKeyInfo` (last four characters, limit, when checked) is in the Leash Log's storage. The key is only ever
  sent to openrouter.ai.

## The kept prompts

Settings → **AI prompts** (it was "Sparkle prompts"): every prompt the sparkle or Write with AI sends or copies, shared
as `ai-prompts-<date>.zip`, a `.txt` (the prompt, asking for the reply alone) and a `.json` for each, named by time.

- The `.json` has the inputs (`field`, `writes`, `text`, `context`, `version`) and, for a prompt sent to a model,
  `model`, `reply` (exactly as it came back) and `cost`, or `error` (with `cost` when an empty reply was charged).
- `logPrompt` returns the entry's id; `notePrompt(id, outcome)` adds the reply afterwards.
- A prompt sent to a model is always kept, so two models on the same prompt are two entries. A copied prompt identical
  to the last one kept is skipped.
- Write with AI's entries say `field: "Walk notes"`, the old name, so old and new data share it.
- Entries from before Nov. 12, 2026 (evening) have no model, reply or cost.

## Testing models

The model tests were throwaway Node scripts, not in the repo. To repeat one:

- Build prompts with the app's own `writingPrompt` / `walkPrompt` (both import cleanly into Node) from the kept prompts
  zip or from `status.yaml`, and send them with `askModel` or a plain `fetch` to `/api/v1/chat/completions` with
  `usage: { include: true }`, which reports each call's `cost`.
- Check automatically for what a model left unfixed (the roughening above), numbers or links it added, line breaks in a
  tidy-up, `parseWalkReply` problems and word counts. Then read the Walk notes replies: that's where quality differs.
- Cap the spend in the script. A full run (14 prompts × 4 budget models) costs about 10 cents; premium models about 20
  times as much per call.
- Run each case more than once before deciding on speed: OpenRouter routes to different hosts, and a single run can be
  off by 20 times (MiMo: 1 s, then 32 s).
- For something sturdier, [promptfoo](https://www.promptfoo.dev) can use OpenRouter as its provider, with these checks as
  assertions and a stronger model grading voice and invention.

## Not done yet

- The sparkle has no Stop.
- Nothing has been checked on an iPhone: the split button and its inline menu, Stop, the sparkle's Undo, the price
  refresh.
- The Claude app could ask Claude itself (its `sample` capability, as `services/stageAI.js` does) instead of copy and
  paste; it was left as copy and paste on purpose.
- Short notes could ask for a summary alone, so they don't grow.
