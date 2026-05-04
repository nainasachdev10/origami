## How model switching works in Claude Code

There's a built-in hybrid alias called `opusplan` — in plan mode it uses Opus for complex reasoning and architecture decisions, then automatically switches to Sonnet for code generation and execution. That's the closest thing to "auto-switching" that's native to Claude Code right now.

True automatic routing by task type (plan → opus, code → sonnet, chat → haiku) doesn't exist yet as a built-in feature — it's actually an open feature request. So the "auto" part has to come from instructions you write in `CLAUDE.md`, which tells Claude when to switch itself.

---

## The 3 tools available to you

**1. `opusplan` mode** — built-in, no config needed
```
/model opusplan
```
Planning phase uses Opus for reasoning and architecture analysis, execution phase automatically switches to Sonnet for code generation. Particularly useful for tasks that start with "figure out what needs to change" and end with "now make the changes."

**2. Manual `/model` switching mid-session** — free, instant
```
/model haiku    # quick reads, formatting, boilerplate
/model sonnet   # default coding work
/model opus     # complex bugs, architecture
```
Switching models doesn't clear your conversation history. You can write code with Sonnet, switch to Opus to review it, then switch back to Sonnet to continue.

**3. `CLAUDE.md` instructions** — teaches Claude to self-switch. This is the main trick for autonomous sessions.

---

## The CLAUDE.md prompt (add this to your project root)

This goes in `.claude/CLAUDE.md` or `CLAUDE.md` at your project root. Claude Code reads this on every session start.

```markdown
## Model switching rules

You have access to three models. Follow these rules exactly — switch models
before starting each task type, not after.

### Use Haiku (`/model haiku`) for:
- Reading files to understand structure (ls, cat, grep)
- Writing or updating comments and docstrings
- Generating boilerplate (repeated patterns, test stubs, type definitions)
- Renaming variables or functions across files
- Formatting, linting fixes
- Writing .env.example, README sections, changelogs
- Simple one-liner bug fixes where the cause is already known
- Any task where you're just filling in an obvious template

### Use Sonnet (`/model sonnet`) for: ← THIS IS YOUR DEFAULT
- Implementing new features (functions, components, API routes)
- Writing tests that require understanding business logic
- Debugging where the cause is not yet known
- Code reviews and explaining existing code
- Wiring up integrations between two services
- Refactoring within a single file or module
- Database queries and migrations
- Most of the daily build work in this project

### Use Opus (`/model opus`) for:
- Designing the architecture of a new module or system
- Multi-file refactors that touch 5+ files simultaneously
- Debugging a problem you've been stuck on for 2+ attempts
- Security-sensitive code (auth flows, encryption, token handling)
- Reviewing a full phase of work before marking it done
- Anything where you need to hold the entire system in mind at once
- Tasks flagged with the word `ultrathink` by the user

### How to self-switch during an autonomous session:
1. Before starting a new task, classify it against the rules above
2. Run `/model <haiku|sonnet|opus>` silently (no need to announce it)
3. Complete the task
4. After finishing a complex Opus task, switch back to Sonnet automatically

### opusplan mode:
Use `/model opusplan` at the start of any session where the first step is
"figure out what needs to change before writing any code." This gives Opus
reasoning for the plan and auto-drops to Sonnet for execution.

### Cost discipline for this project:
- Default to Sonnet if unsure — it handles 90% of tasks at near-Opus quality
- Never use Opus just to read files or check what exists
- Batch Haiku tasks: if you have 10 small formatting fixes, do them all in one
  Haiku session before switching back
- When a long autonomous run is finishing, switch to Haiku for the final
  cleanup tasks (updating README, .env.example, comments)
```

---

## What the actual cost difference looks like

| Model | Input | Output | Relative cost |
|---|---|---|---|
| Haiku 4.5 | $1/M tokens | $5/M tokens | 1× |
| Sonnet 4.6 | $3/M tokens | $15/M tokens | 3× |
| Opus 4.6/4.7 | $5/M tokens | $25/M tokens | 5× |

Tactical model switching can optimize your usage costs by 60–80%. For a long autonomous build session, most of the token volume goes to reading files and generating boilerplate — both Haiku tasks. Haiku 4.5 achieves 90% of Sonnet 4.5's agentic coding capability at 2× speed and 3× cost savings.

---

## Quick session start patterns

For your content agent project specifically, use these when kicking off Claude Code:

```bash
# Starting a new phase (e.g., Phase 2 - YouTube pipeline)
# Opus plans what needs building, Sonnet executes
claude --model opusplan

# Daily coding session (implementing known features)
claude --model sonnet

# Quick cleanup / small fixes / docs only
claude --model haiku

# You're stuck on a bug and Sonnet failed twice
/model opus
# ... solve it ...
/model sonnet   # switch back immediately after
```

The CLAUDE.md rules above handle the autonomous mid-session switching automatically — you don't have to think about it once it's in the file.