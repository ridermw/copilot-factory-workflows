# Loop Engineering — speaker script

Read-through companion to `index.html`. **Generated from the deck**, so the slide
numbers, cues and script always match what is on screen.

- **Your cue** is what you *do* — timing, emphasis, what to watch for in the room.
- **What you say** is the spoken script, first person, as delivered.

Open the deck and press **N** for notes, or **S** for the presenter console, which
shows both alongside a live preview and a timer.

Spoken length: **3313 words** across 23 slides — about 20 minutes at a brisk
conversational pace.

---

## 1 · Loop engineering

**Your cue.** Credit the sources out loud before you start. Say the term is about six weeks old, so nobody feels behind. Frame the ask: twenty minutes, one idea, one thing to try this week.

This is a talk about a term that did not exist two months ago, so if you have not heard it, you are not behind. I want to give you the vocabulary, the failure modes, and one thing you can build this week. Most of what is here comes from a field study on loop engineering, two Anthropic engineering write-ups, a first-party account of a very large migration, and four open source harnesses I read for this. Sources are on the last slide and every claim in here traces to one of them.

---

## 2 · One engineer rewrote 535,000 lines of Zig into Rust in eleven days

**Your cue.** Read the disclosure out loud - this room will find it anyway, and you get more credit for saying it first. Do not sell the speed. The interesting question is not how fast, it is how anyone dared merge it.

I want to start with the largest example I could find that has real numbers attached.

Bun is a JavaScript runtime. Five hundred and thirty-five thousand lines of Zig, across fourteen hundred files. One engineer rewrote all of it into Rust in eleven days, using about fifty dynamic workflows driving Claude Code. The result was a pull request with over a million lines added. Their own estimate for a team doing it by hand was a year.

Disclosure, and I would rather say it than have you find it: Bun is owned by Anthropic, the engineer works there, and he used a pre-release model. He states that in the first line of the post. I am using it anyway, because unlike most claims in this space every number is published and checkable.

And it shipped. Claude Code has been running on it since June - startup got ten percent faster and, in his words, barely anyone noticed. Boring is good. Prisma, who have no stake in any of this, tested it against the production failures that were breaking their own platform, found them fixed, and launched their public beta on it.

Here is the question I actually want to spend the next twenty minutes on. It is not how you generate a million lines of code. We all know the answer to that now. It is: how did anyone review a million-line pull request and feel safe merging it?

---

## 3 · The answer, in one sentence: “How do you review a PR with +1 million lines added?”

**Your cue.** This is the whole deck on one slide. Say that. Everything after is these three in more detail, plus what it costs you when you skip them.

He answers it in one sentence, and that sentence is the entire talk, so I will read it exactly.

A language-independent test suite with a million assertions, adversarial code review, and - when something does go wrong - fixing the process that generates the code instead of hand-fixing the code.

Three disciplines. A judge that does not care who wrote the code. A reviewer whose job is to make it fail. And when you find a defect, you repair the thing that produced it rather than the thing it produced.

Notice what is not on that list. A better model. Every one of these is a property of the system around the model, and all three are things you could build this quarter. Everything after this is one of the three in more detail, plus what it costs you when you skip them.

---

## 4 · The term is six weeks old and it has a specific meaning

**Your cue.** Read the quote verbatim. The weight is on replacing oneself. Pause after it.

The definition is one sentence: loop engineering is replacing yourself as the person who prompts the agent, and designing the system that does it instead.

The weight of that sentence is on replacing yourself. Every other term we have been handed in the last two years - prompt engineering, context engineering, harness engineering - assumes a human at the keyboard, directing the agent line by line, and tries to make that human better at it. This one deletes the assumption. You are not in the loop. You are outside it, building the loop.

---

## 5 · Four floors: each one moves you from doing to designing

**Your cue.** This is the orientation slide. Most of the room lives on floors one to three. Do not disparage those floors - floor four sits on top of them.

It helps to see it as a fourth floor. Prompt engineering is one message. Context engineering is what the model can see when it answers. Harness engineering is the tools, the memory, the guardrails around it - that is where most serious agent work in this company lives today, and it is real work.

Loop engineering is the floor above: who decides the agent should run at all, and what happens to the output afterwards. You still need the three floors underneath. Nothing here replaces them.

---

## 6 · Every shift starts with amnesia

**Your cue.** The shift metaphor is the best explanatory image in the whole deck. Say it slowly. Everyone in this room has inherited a half-finished handover.

Why does that floor need to exist at all? Because of a constraint that is structural, not a capability problem.

Agents work in discrete sessions, and each one starts with no memory of what came before. Anthropic's framing is a software project staffed by engineers working in shifts, where every new engineer arrives remembering nothing about the last shift. You have all inherited that handover.

It produces two failures. The first is one-shotting - the agent tries to do the whole thing at once, runs out of context halfway through a feature, and the next session inherits something half-built and undocumented. The second is worse and shows up later: a session looks around, sees that a lot of progress has been made, and declares the job finished.

And compaction does not save you. Summarizing the conversation in place keeps continuity, but it does not reliably hand the next agent clear instructions.

---

## 7 · One turn of a loop does five things: drop any one and it stops turning

**Your cue.** This is the spine of the deck. Everything after refers back to it. Say the five out loud in order - people will write them down.

So what is a loop, concretely? Five moves, and one turn of the loop does all five.

Discovery - it finds work worth doing, rather than being handed a list. Handoff - it gives that task to an agent, in isolation. Verification - something independent decides whether the result is actually right. Persistence - the result and the state land somewhere that outlives the conversation. Scheduling - it happens again without you.

The claim is that these are load-bearing: drop any one and the loop will not turn, or it will turn in place. The paper asserts that and never tests it, so take it as a definition rather than a finding - but as a checklist it has held up every time I have used it.

One note on discovery before I move on, because it sets the ceiling for everything else: if the loop picks work of no value, the other four moves execute beautifully in service of nothing. And have the automation trigger a named skill you can read and improve, not a wall of instructions pasted into a cron job nobody will ever update.

---

## 8 · Each missing move has a name

**Your cue.** Ask the room which one they have built. Most people have built the Manual Loop and called it automation. Let a couple of answers land before moving on.

Because each move is load-bearing, each one has a named failure when you leave it out.

Drop verification and you get the Nodding Loop - it ships whatever it made, and as the paper puts it, a loop without a real check is just an agent nodding at itself. Drop persistence, the Amnesiac Loop: every run starts from zero. Drop scheduling, the Manual Loop - which is one run you did once, not a loop, and I would guess it is the most common thing in this room today. Drop discovery, the Blind Loop: four moves executed beautifully on work that did not matter. Drop handoff, the Tangled Loop: agents stepping on each other in the same files.

Which of these have you built? Genuinely - has anyone got a Manual Loop they have been calling automation?

---

## 9 · Five independent sources, one finding: it always praises itself

**Your cue.** Slow down - the next four slides all follow from this one. Strongest evidence in the deck: five unconnected parties, one finding. Say that explicitly; it is why the recommendation on the next slide is not hedged.

So let us take verification, because it is the easiest of the five to cut corners on and the one you can least afford to skip. The framing I like: the check is the thing that can say no. If nothing in your loop can say no, you do not have a loop, you have an expensive way to generate confidence.

And here is the single most corroborated finding I came across building this, which is why the recommendation is not hedged.

Anthropic Labs: agents asked to evaluate their own work confidently praise it, even when the quality is obviously mediocre to a human. The field study, independently: the agent that wrote the code grades its own homework too softly. The qm harness, a completely different project, states it as an engineering rule - the context that produced a diff already believes it is correct, and that belief is the bias review exists to defeat. And ringer, a fourth project: an agent's own done is not evidence, exit codes are.

And the Bun engineer, who had the most at stake of anyone here, puts it as a plain observation about incentives: the Claude that wrote the code wants the code to get accepted; the Claude that reviews wants to find issues in it. He notes it is the same reason we do not let humans review their own pull requests.

Five unconnected sources, different domains, same result. That is about as close to settled as anything gets in this field right now.

---

## 10 · Separation is a dial, not a switch: turn it up until the reviewer can disagree

**Your cue.** State the recommendation plainly here: no self-review. Adversarial review, rubber duck, or spar, in a different agent. This is the Monday ask, stated early.

The fix is separation, and separation is a dial rather than a switch.

At the weak end, an agent reviewing its own work, which we just established does not work. One notch up: a different prompt, same tools. Further: a different persona with different tools, told to be skeptical. Furthest: a different model from a different vendor, which some harnesses now do by config alone.

The reason it works is not that the second agent is smarter. It is that tuning a standalone evaluator to be skeptical is far more tractable than making an author critical of its own work.

Bun's version is worth copying exactly, because it is structural rather than a preference. One implementer, two or more adversarial reviewers. The implementer doesn't review. The reviewer doesn't implement. And the reviewer gets only the diff - not the original file, not the implementer's reasoning - and is told to assume the code is wrong.

So the recommendation, plainly: no self-review. Put the critique in a different agent - adversarial review, rubber duck, spar, whatever your tooling calls it. That is the one change I would like everyone to leave with.

---

## 11 · Who checks the check? A judge that doesn’t catch breakage isn’t a judge

**Your cue.** This is the slide people should photograph. It is the cheapest high-value practice in the deck.

Second-order problem, and this is the one I had not thought about before reading for this talk: who checks the check?

The line is from Anthropic's code migration write-up - a judge that doesn't catch breakage isn't a judge. Their practice is to run the judge against deliberately broken code and confirm it fails. If your check passes broken code, you do not have a check, you have a green light.

ringer ships this as an actual command. It runs every check against the unmodified codebase before any worker spawns, and its linter refuses manifests containing checks that cannot fail. Their rule is: fix the check before spawning. Two different projects, different domains, same conclusion - and only one of them automated it.

---

## 12 · Two different jobs: verification is mechanical, review is adversarial

**Your cue.** Note the division: verification mechanical, review adversarial. Those are two different jobs and people conflate them. Flag the third row as your own synthesis.

Which leads to the design rule I would put on the wall. Anything deterministic logic can solve never goes to a probabilistic model, and where you draw that line decides whether the loop is reliable.

In practice that splits into two different jobs that people conflate. Verification should be mechanical - a compiler, a linter, a diff, a test suite, an exit code. Something that cannot be talked out of its answer. Review should be adversarial - a second agent, hostile, looking for what the first one talked itself into. You use an LLM rubric only where there is genuinely no mechanical oracle available, and that is my synthesis rather than any single source's claim.

---

## 13 · Three bugs the adversarial reviewers caught. All three compiled cleanly.

**Your cue.** This is the slide that convinces engineers. Compilers cannot catch these. A human reading a million-line diff would not catch these. Pick one and walk it - the async close is the most visceral.

Let me show you what the adversarial reviewers actually caught, because this is the part that convinced me.

Three bugs. All three compiled cleanly. All three looked completely plausible.

The first: closing a pipe. The libuv close call is asynchronous - libuv keeps the raw pointer until the next tick, then calls your callback, which frees the allocation. But in the ported Rust, the box holding that pipe drops at the end of the match arm. So libuv is left holding freed memory, and the callback frees it a second time. Use-after-free, then double-free. The compiler is perfectly happy.

The second: a file modified before 1970. Truncating a negative float into seconds and nanoseconds rounds toward zero and gives you a negative nanoseconds field, which is not a valid timespec.

The third: an eager-evaluation bug. unwrap_or evaluates its argument eagerly, so the fallback panics before the function ever gets to ignore it.

None of those are catchable by a compiler, and none realistically catchable by a human reading a million-line diff. They were caught by a second model handed the diff and nothing else, told to assume the code was wrong.

---

## 14 · Four harnesses, one rule: state lives outside the conversation

**Your cue.** Fast slide. The definition of done is the takeaway; it makes resumability free.

Persistence - quickly, because it is the least controversial and the most agreed-upon.

Four separate projects, one rule: a loop's memory cannot live in the context window. Progress files and git history. A durable queue that never trusts a stale status log. Never RAM alone. And my favourite version of it, from the migration work: define done as the output file exists on disk, rebuild the work queue from disk every time, and the whole thing becomes resumable by construction. You get crash recovery for free because you never had a separate notion of progress to lose.

---

## 15 · When the same defect keeps appearing: fix the rule, not the file

**Your cue.** This generalizes past agents - it is ordinary good engineering, which is why it lands with this room. Say so.

This one is the most transferable idea in the deck, and it is not really about agents.

When a reviewer keeps catching the same mistake across many files, the fix is never per-file. You add one sentence to the rulebook and regenerate the affected batch. The rulebook grows; the code never gets hand-patched against it.

Bun has the cleanest example. Partway through, the agents started reading get the crates to compile as stub out the functions that do not compile, and writing long comments justifying the workarounds. The fix was not to go and unstub them. It was one new rule handed to the reviewers: if you need a paragraph-long comment to justify why the workaround is okay, the code is wrong, fix the code. One prompt edit, a few hours, and it stopped.

You already believe this about production code. The point is that when generation is nearly free, patching instances is not just inefficient - it actively hides the defect in your loop.

---

## 16 · The reorganization in one line: budget stops scaling with lines written and starts scaling with decisions made

**Your cue.** Flag the caveat honestly - these are observations from single runs, not benchmarks. This room will ask.

Economics, because this is a department that thinks about cost.

The framing I like best: your premium budget stops scaling with lines of code written and starts scaling with decisions made. That is the whole reorganization in one line.

Two numbers from ringer, and I want to be honest that these are observations from single production runs, not benchmarks. Keeping one live status page updated by a dedicated subagent cost upwards of ninety thousand tokens. Rendering the same page with a plain script cost zero, forever. A single compiled report cost about two hundred and eighty-four thousand tokens from one worker.

The practice that follows is model tiering: cheap models for high-volume implementation work, your best model for the reviewers and for anything that writes rules other agents will follow. Spend where judgment happens.

---

## 17 · Four costs that accrue in silence

**Your cue.** This is the honest counterweight. Do not rush it - a room this skeptical will trust the rest of the deck more because this slide exists.

Now the part that keeps this from being a sales pitch. Four costs, and the thing they share is that none of them makes a noise while the loop is running. The more cheerfully it runs, the more quietly it errs.

Verification debt: every merge saves time, and the saved time becomes unverified output waiting to be paid back. It hides in the gap between it runs and it's right.

Comprehension rot: the codebase grows while the map in your head stalls.

Cognitive surrender: the attitude version. Not I don't have time to check but I no longer want to bother. The more reliable the loop, the easier it is to stop having an opinion.

Token blowout: the only one that hits a bill directly. One bug can spin all night and produce an invoice rather than fixed code.

---

## 18 · Twenty green pull requests, one morning: the four costs are one failure wearing four faces

**Your cue.** Walk the cycle once with your finger. End on the buried errors. Do not soften the landing.

And they are not four independent risks. They are one failure wearing four faces, and they feed each other.

Here is the worked example. Twenty pull requests open overnight, all green. Three of them contain a subtle error the tests do not cover. With no independent evaluator, those three merge - verification debt. Because you merged twenty PRs without reading them, your mental model now lags by twenty changes - comprehension rot. Because it all went so smoothly, you stop reading tomorrow's batch - cognitive surrender. And because the loop spawned helpers and retried freely all night, the bill is triple what you estimated - token blowout.

So: three buried errors, sitting in a codebase you no longer fully understand, guarded by someone who has stopped looking. Discovered eventually, when one of them surfaces as an incident.

---

## 19 · The dangerous part is the same spot

**Your cue.** Let it sit. Say nothing for two seconds after reading it. This is the emotional centre of the talk and it is why the adversarial-review recommendation matters.

And this is the sentence I have not been able to stop thinking about.

The most fascinating thing about loop engineering is that it lets one person do a team's work. The most dangerous thing is the same spot - because a team argues with itself, and one person plus a pile of loops easily becomes an echo chamber where no one argues.

That is the real argument for the adversarial reviewer. Not that it catches more bugs, though it does. It is that it is the only thing left in the system that disagrees with you.

---

## 20 · Every component encodes an assumption about what the model cannot do: so components expire

**Your cue.** This is the slide that prevents cargo-culting. Frame the deletions as a result, not an embarrassment.

One more thing before I land, and it is the guard against everyone in this room cargo-culting a harness.

Every component in a harness encodes an assumption about what the model cannot do on its own, and those assumptions go stale as models improve. Anthropic's own harness is the evidence: on one model generation it needed context resets and decomposition into sprints. On the next, they deleted both, and the builder ran coherently for over two hours without them. The planner survived, because without it the generator under-scoped.

So the test is not does a loop need an evaluator. It is: does this task sit beyond what the model does reliably on its own, right now? When a new model lands, re-run that question and delete what is no longer load-bearing.

---

## 21 · Where I think this goes: loops are one shape of a larger thing

**Your cue.** Label this as your framing, out loud. The sources do not make the superset claim - you do. This room respects that distinction and will notice if you blur it.

Briefly, where I think this goes, and I want to flag clearly that this next bit is my framing, not something my sources claim.

I think loops are one shape of a larger thing. Dynamic workflows are the superset, and a subset of dynamic workflows are loops. Two pieces of evidence. The mature harnesses have stopped treating loop as the top-level concept - they separate workflow, loop, scheduler and organization as different axes: what the agents take on, how long they keep at it, when it happens, what persists. And the Bun rewrite was not one loop, it was about fifty dynamic workflows composed together, each of which was internally a loop.

That also resolves the tension from the last slide. The five moves define the shape. What implements each move is what decays.

---

## 22 · The same five moves, on work this department already does

**Your cue.** Deliberately generic - do not invent details about our systems. The point is that they already own every ingredient. Invite them to fill it in for their own area.

So what does that look like here. I have kept this deliberately generic, because I am not going to stand up and invent details about systems you own better than I do.

But notice you already have every ingredient. Discovery is a scheduled pass over a signal you already collect. Handoff is one isolated worktree per finding. Verification is the mechanical gate you already have - the thing that already tells you pass or fail, which is exactly the referee this whole talk is asking for. Persistence is a PR, a work item, a state file. And scheduling is the part where it happens tomorrow without you.

That is an illustrative shape, not a proposal. A real one needs a name, an owner, a hard budget cap, and a check you have proven can fail.

---

## 23 · One loop, one week

**Your cue.** End on the ask, not on a summary. Three things, one week. Then take questions - expect pushback on cost and on who owns the loop when it breaks.

Three things, and I would genuinely like someone to try this before we next meet.

One: pick the manual follow-up you did most often this week. That repeated step is a loop asking to be built.

Two: write the check first, and prove it fails. Run it against deliberately broken input before you ever point an agent at it. If it passes broken input, you do not have a check.

Three: put the critique in a different agent. Adversarial review, rubber duck, spar - whatever your tooling calls it. Never let the thing that wrote the code be the thing that approves it.

And cap the budget before you ship it, so an idle bug cannot burn a night's quota.

Sources are here, everything in this deck traces to one of them, and I am happy to share the full inventory. Questions.

---
