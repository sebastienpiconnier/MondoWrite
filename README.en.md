# Cosmos

[Français](README.md) · **English**

**From chaos to an ordered world: a canvas for novelists and screenwriters who build their story before writing it.**

![The Cosmos canvas: four cards (idea, character, place, scene) connected by labeled threads](docs/images/canvas-en.png)

<a href="https://youtu.be/QTNqWJBSaO4"><img src="docs/images/video-poster-en.jpg" width="640" alt="Watch the Cosmos presentation video (1 min)"></a>

[Download](#download) · [Features](#features) · [AI](#ai-if-you-want-it) · [Platforms](#platforms) · [Development](#development)

---

## 🏛️ Dear architect writers

You don’t start a novel by sailing blind. You don’t push your characters off a cliff hoping a net will appear in the next chapter.

For you, writing is an act of construction. Before you set down the first sentence of chapter one, you need to see the skeleton, test the framework, map the geography of the world and pin down the deep motivations of every character.

But until now, you had to juggle: a virtual board on one side, a word processor on the other, scattered folders of notes, character sheets copied three times over… Chaos before order.

In Greek, *kosmos* means precisely that: the order of the world, born out of chaos.

## 📐 A tool built around the way you work

Cosmos was designed on one core principle: your structure should emerge naturally, without bureaucracy.

```text
   [ IDEAS & FRAGMENTS ] ──► ( Interactive canvas )
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
   [ STORY BIBLE ]          [ OUTLINE & TEMPLATES ]  [ CLEAN MANUSCRIPT ]
   Synced character and     3 acts, Save the Cat     Local, future-proof
   place sheets, no retype  or Hero’s Journey        Markdown files
```

- **4 views, 1 single content.** Change a character trait on the Canvas and the Bible updates instantly. Rename a scene in the Outline and the Manuscript follows. You never copy the same information twice.
- **Proven structure templates.** Place your scenes along the Hero’s Journey, Save the Cat! or the three-act structure. See the timeline by plotline and spot at a glance where a subplot fades out.
- **The character sheet as a dramatic engine.** Define your characters’ engine in three readable boxes (Wants, Needs, Wound). Let the assistant ask you the right questions to fill in the blanks.
- **Ownership and longevity.** No proprietary cloud, no subscription, no locked format. Your projects are plain folders of Markdown files saved on your own machine. You keep 100% control over your work.
- **Free and open source.** Cosmos is free software, released under the GPL-3.0: you can use it, study it, change it and share it.

**AI will not write your book.** If you choose to turn it on (including a 100% local model on your computer), it only points out inconsistencies, puts your notes back in order and asks you sharp questions. You remain the sole architect.

## 🧱 Ready to build your next universe?

[Download Cosmos](https://github.com/sebastienpiconnier/cosmos/releases/latest) for free on macOS, Windows or Linux, and turn your fragments of ideas into a perfectly ordered world.

## Download

Installers for macOS (Apple Silicon and Intel), Windows and Linux are available in the [Releases](https://github.com/sebastienpiconnier/cosmos/releases).

> **First launch.** On macOS, the app is signed and verified by Apple: it opens normally. On Windows, it isn't signed yet: if SmartScreen appears, click “More info”, then “Run anyway”.

**Updates:** Cosmos tells you when a new version is out and installs it in one click, after saving your project (Settings, “Updates”, or “About Cosmos”).

Cosmos is under active development (version 0.1.6).

## Features

### The canvas

- **Free-form cards:** double-click or right-click the canvas, long-press with a finger, use the “New card” button or press `N`, and start writing its title (`Enter` moves on to the text). Rich text (bold, italic, lists). A new card never lands on top of another.
- **Ten card types:** Idea, Character, Place, Scene, Plot, Theme, Question, Image, Link, Document. Change the type by typing `/` at the start of a line or by tapping the type label.
- **Pasting, as in Milanote:** paste or drop a link or an image onto the canvas: a single **Link** or **Image** card is born where you are (a pasted text becomes an Idea). Paste an address into a card that is still empty: that card becomes the Link card, without making a second one. “Organize the canvas” sorts them into Images and Links frames, and the Bible has a section for each. For a link, Cosmos reads the page: title, author, publication date and the site’s image come in on their own. Pasting the same link twice makes only one card. A link keeps the day you read it; “Fill in from the page” adds what is missing, “Open” shows the page.
- **Folded cards:** a card with a long text folds up, “More details” opens it.
- **Formatting and Markdown:** select a word, a bar offers bold, italic, strikethrough, heading, lists, checkbox, quote. Markdown works as you type (`**bold**`, `*italic*`, `# heading`, `- list`, `[ ] task`) and when you paste, in cards, the Bible and the manuscript, and files stay in Markdown.
- **To do:** unticked boxes, passages “to revisit”, questions kept for later and open questions, gathered in one panel, each linked to its card or scene.
- **Keyboard shortcuts** for everything that matters; Ctrl/Cmd+/ lists them.
- **Labeled threads:** drag a thread from one card to another and name the link (“works at”, “suspects”, “takes place at”). The thread always leaves from the nearest edge. Click the thread (or tap it) to rename it or **unlink** the cards; in the Bible, a link’s cross does the same.
- **Mentions:** type `@` in a card to mention another one. The thread is drawn for you, the mention follows when you rename the card, and you can create the mentioned card without leaving your sentence.
- **Images:** drop an image on a card or on the canvas, or use the card’s image button. It keeps its proportions (a blurred backdrop drawn from it fills the sides), is copied into the project’s `medias/` folder and also shows in the Bible.
- **PDF:** drop, paste or import a PDF (the canvas “PDF” button): a **Document** card appears, with a preview of its first page, its page count, author and year when the file gives them. “Read the document” opens it in the app, page by page. The PDF is copied into `medias/`.
- **Your author profile:** on the projects page, enter your first name, last name, pen name and contact details once. Every new screenplay puts them on its title page (author and contact), and the exported manuscript carries them on its cover page. They stay on the device and can be edited anytime.
- **Free photos:** the canvas “Photos” button (or “Add photos” in a sheet’s gallery) searches **Openverse** (openly licensed images, no key), **Pixabay** or **Unsplash** (free key, pasted once, kept on the device). The photo you pick becomes an Image card, with the author, link, source and licence in its sheet. A card’s image button (and a character’s portrait in the Bible) opens the same window: a free photo, or an image from the device.
- **Link to the sheet:** every typed card has a button that opens its sheet in the Bible.
- **Multiple selection:** `Shift` + drag draws around cards, `Ctrl`/`Cmd` + click adds one, `Ctrl`/`Cmd`+`A` selects everything, `Esc` deselects; with a finger, the “Select” button. Selected cards move together, and a bar offers to frame them or move them to the trash.
- **Card width:** drag the bottom-right handle of a selected card, or `Alt`+`→` and `Alt`+`←`.
- **Frames:** a named rectangle (“Act 1?”, “The lighthouse”) to group cards. Button or `C` key; with cards selected, the frame wraps them. Moving it takes its cards and inner frames along.
- **Organise the canvas:** one button puts every card in a frame (characters, places, themes, questions, loose ideas, images, links, documents, book pages) and the scenes by template beat and chapter, linked in story order. Landscape first: beats follow each other left to right, in rows of at most 8 scenes. `Ctrl`/`Cmd`+`Z` puts everything back.
- **Trash:** a deleted card (from the canvas, the outline, the step outline or the manuscript) goes to the trash with its threads, and in a screenplay with its scene’s text. A message offers to undo; the trash (in Settings) puts each card back where it was or deletes it for good. It lives in the project’s `corbeille/` folder.
- **Undo and redo:** `Ctrl`/`Cmd`+`Z` and `Ctrl`/`Cmd`+`Shift`+`Z`, or the two buttons on the canvas. Cards, threads, moves and text.
- **Search:** the magnifier in the top bar, or `Ctrl`/`Cmd`+`F`, finds a card by its title or text and shows it on the canvas.
- **Minimap and zoom** to find your way as the canvas grows.

### The Bible

The Bible opens on **the project cover**, like the back of a book: title, tagline, logline, summary, comparable titles and statement of intent, with chips to tap for genre, audience, format, point of view, tense and tone (a list of common choices, or your own words). The length comes from your word goal, the themes from your Theme cards. Nothing is required.

The Characters section offers a **relationship map**: portraits linked by the canvas threads, with their labels (“sister of”, “betrays”).

Then every entry, generated from your cards, on a single page and grouped by section, with their images and links; the table of contents takes you to each section. The Bible reads like the document it exports: same sections, same order. There is nothing to fill in: the Bible updates as the canvas changes. You can also create and name an entry there: its card shows up on the canvas. Every section is shown, even empty; you choose which to keep and in what order, and the export follows that choice. Everything can be edited in place, title and text. Every entry can have a photo gallery (add by button or drop, enlarge, pick the main picture), places and plots have their own sheet too (atmosphere, period; dramatic question, stakes, inciting incident, obstacles, resolution), and a character has a round portrait, what **drives** them in three boxes read at a glance (Wants, Needs, Wound; for an antagonist: Motivation, Strength, Flaw), their arc type drawn as a curve (positive, tragic, flat), an assistant asking questions **by topic** (the essentials, past, body, voice, emotions, anger, relationships…), whose answers fill the sheet and a **character sheet**: role, gender, age, occupation, nicknames, background, appearance, personality, voice, flaw, fear, secret, relationships, arc. All optional: only filled fields stay on screen. Under the name, the poster sums up gender, age, occupation and role, and says how often the text names them and from which scene.

### The outline

- **Four templates:** free, three acts, Save the Cat, hero’s journey. A sentence under the picker says what each one is, and each slot reminds you in one line what belongs there.
- **Placing scenes:** drag a scene into a slot, move it with the arrows or pick its slot from a menu. Canvas scenes without a place yet wait under “To place”.
- **Writing from the outline:** a scene created in a slot gets its card on the canvas right away, and its title can be edited from both sides. Each scene has its **synopsis** (what happens, in one sentence), written right in the outline.
- **Chapters:** within each slot, scenes are grouped by chapter. “New chapter from here” cuts the story at a scene; the number follows on its own, the title is optional.
- **Changing your mind:** switching templates loses nothing, each template keeps its own arrangement.
- **List or index cards:** the outline shows as a list or as index cards.
- **Timeline by storyline:** a table of scenes where each storyline (a Theme card), character and place has its row. You see at a glance where a storyline goes missing for too long, and you link a card to a scene by tapping a cell.

### The character assistant

- **Questions, not answers:** in a character’s entry, “Ask about” puts one question at a time, sorted by topic (the essentials first, then past, body, voice, daily life, emotions…). Fill in the sheet or let the questions guide you: both lead to the same place.
- Your answer fills the matching field of the sheet (Wants, Wound, Voice…) when it is empty; other answers go to “Answers to questions”, folded under the sheet and editable. You can also skip to another question.
- **“I don’t know yet”** keeps the question for later, under the entry’s “To dig into” tab. On the canvas, the character’s card only shows “3 questions to answer”, which opens the entry.
- **AI summary** (if an AI is plugged in): it puts what you wrote about the character (sheet, notes, answers) in order, without inventing anything. You add it to the entry or ignore it.

### The manuscript

- **Chapters as you write, as in NEO:** Enter twice on an empty line breaks the scene, the rest goes into a new scene; Enter a third time starts a new chapter. Each break is announced at the bottom of the page with an “Undo” button; Backspace in the empty scene undoes it too. The chapter number and title sit at the top of the page, as in a book.
- **The pages of a book:** a scene can become a title page, copyright, dedication, epigraph, prologue, epilogue, acknowledgments or “about the author”. They place themselves before or after the story, and each one says what goes there (“Who is this book for?”).
- **One scene at a time, on pages:** you write the text of each scene in outline order, on book-format pages sized to your screen (indents, justified text, a drop cap at each chapter opening), numbered from one scene to the next. Scenes are grouped by chapter; move a chapter by dragging it in the left column, or with its arrows. Above the page, a quiet bar: the scene title, the page type, focus mode and the trash.
- **Focus mode:** the page alone on screen, typewriter-style if you like (the current line stays at eye level), with the sentence, line or paragraph in full ink and the rest faded. Ctrl/Cmd+Shift+X marks a passage “to revisit”.
- **Statistics and goals:** words, pages, reading time, scenes written, average per scene; words written today, days in a row, daily goal and book goal (an idea taken from NEO).
- **In this scene:** characters and places mentioned in the text show up beside it, along with the card’s notes.
- **Your files:** every written scene is a Markdown file in `manuscrit/`. Deleting a card never erases its text: it goes to the trash and comes back with it.

### Novels and screenplays

A project is a novel or a screenplay, and you can switch at any time. The canvas and the files stay the same, only the vocabulary adapts: Place becomes Location, the Outline becomes the Step outline, the Manuscript becomes the Screenplay, and Scene cards take the shape of a scene heading (`INT. LIGHTHOUSE - NIGHT`) in Courier Prime.

### The screenplay editor

For a screenplay project, the Screenplay view is an editor in standard film format, linked to the canvas: each scene heading is tied to its Scene card, and what you write in one shows up in the other.

![The screenplay editor (French interface): scene list, standard-format page and “In this scene” panel](docs/images/scenario-fr.png)

<details>
<summary><strong>Everything the screenplay editor does</strong></summary>

- **Real pages:** the sheet has the proportions and margins of the chosen paper size (A4 or US Letter), page after page, as in print.
- **Title page:** a cover page where you write the title, your name, the “Written by” credit, your contact address and the date. Your name is remembered for your next screenplays.
- **Six elements:** scene heading, action, character, parenthetical, dialogue, transition, with the standard indents.
- **All from the keyboard:** `Tab` changes the element type, `Enter` moves to the next logical element (character, then dialogue, then action). An element bar does the same with a mouse or a finger.
- **Detection as you type:** a line starting with `int.` or `ext.` becomes a scene heading, an opening parenthesis starts a parenthetical.
- **Completion:** characters and locations from the Bible are suggested as you write, along with extensions (V.O., O.S.) and times of day (DAY, NIGHT). An unknown character or location can become a card in one gesture.
- **Linked to the canvas:** renaming a scene heading renames its card, and the other way round. A scene, its location or a character you write in the screenplay gets its card on the canvas; a Scene card created on the canvas enters the screenplay.
- **Pages and minutes:** the page count and the estimated running time (about one minute per page) are always visible.
- **Step outline:** the scenes in order, as a list or as index cards, with their synopsis, characters and length. Reorder them by dragging or with the arrows, and the scene’s text follows in the file. In the Screenplay view too, the scene list on the left can be reordered: drag a scene, use the current scene’s arrows, or Alt+↑ / Alt+↓.
- **Step outline templates:** three acts, Save the Cat, eight sequences or TV episode (cold open, four acts, tag). Each template and each slot explain what goes there. Slots are sections of the Fountain file, readable in other software, each with its running time.
- **Deleting a scene:** from the step outline, the scene goes to the trash with its text.
- **Synopsis:** one sentence per scene, written from the scene panel or the step outline, saved as a Fountain synopsis.
- **Import:** an existing `.fountain` file becomes a project, with its Scene, Character and Location cards already created and linked.
- **Scene numbers, underlined headings and focus mode:** two buttons in the bar number the scenes in the margin and underline the headings (on screen, in the PDF and in Final Draft), and a mode keeps only the page on screen.
- **An open format:** the text is saved to `scenario.fountain`, in [Fountain](https://fountain.io) format, readable by other screenwriting software.

</details>

### AI, if you want it

Cosmos works entirely without AI. You can plug one in from Settings:

- **Locally**, with Ollama or LM Studio: your texts never leave your machine. No server setting needed.
- **With your own key**, for Claude, OpenAI or OpenRouter: the passages being analysed are then sent to that provider, under its terms. Your key stays on your device, never in the project.

It asks, it doesn’t write: no action changes your project without your say.

- **Tidy up ideas:** suggests a type (Character, Place, Scene…) for your loose ideas. You apply or ignore them one by one, then “Organise the canvas” puts everything in frames.
- **Tailored questions:** in the character assistant, a question based on what the entry already says. You do the answering.
- **Character summary:** puts what you wrote in order, adding nothing.
- **Describe a place from a photo:** if you ask, the AI notes what the photo shows (light, materials, atmosphere), inventing nothing. It needs a model that can read images.
- **Check consistency:** points out possible contradictions between your cards (an age, a date, a place), as questions you can keep for later.

When the AI talks about a card, it names it by its title and type, for example “Inès Morvan (character)”.

The exact instructions sent to the AI are published in [docs/prompts-ia.md](docs/prompts-ia.md) (in French, with the prompts themselves in English).

### Exports

- **Manuscript:** scenes of the same chapter form one chapter, separated by “* * *”. PDF in manuscript format (Courier 12, double spaced), Word (.docx), EPUB for e-readers, or a single Markdown file.
- **Screenplay:** PDF in standard format (Courier 12, standard margins, dialogue split cleanly across pages), Fountain and Final Draft (FDX).
- **Bible:** PDF, Word or Markdown, the project cover first, then the sections chosen in the Bible, in its order, with each entry’s images and links.
- **Canvas:** a PNG image of the whole board, a standard PDF (A4, to send) or large-format PDF (A1, to print), and the card text in Word or Markdown, one part per frame.
- **Nothing to install:** everything is produced by the app itself.

### Comfort

- **Several projects:** a home screen to choose the one to work on, or to create one.
- **Autosave** to Markdown files, or `Cmd+S` / `Ctrl+S`.
- **English and French**, each with its own typography.
- **Light, dark or system appearance.**
- **Mouse, touch and keyboard:** every action has all three paths.
- **Offline:** bundled fonts, no account, no server.
- **One-click updates** (desktop): checked at most once a day, can be turned off; nothing is installed without your OK.

![The same canvas in dark mode](docs/images/canvas-dark-en.png)

## Getting started

- **Choose a project:** on every launch, the home screen lists your projects. From a project, the “Projects” button saves and goes back there.
- **New project:** a working title, novel or screenplay, and on a computer the folder to save it in. “Try with an example” creates a full project, Perrault’s “Little Red Riding Hood” illustrated by Gustave Doré (characters, places, a three-act outline, chapters and the tale written in the manuscript), and opens a six-step guided tour (it stays in Settings).
- **New card:** double-click or right-click the canvas, press `N`, long-press with a finger, or use the “New card” button. Then just write.
- **Change the type:** type `/` at the start of a line, or tap the type label (“IDEA”).
- **Connect:** drag a thread from a point on a card’s edge to another card, then name the link.
- **Settings** (icon at the top right): project type, trash, interface language, appearance, and AI service.

### Your files

Each project is a folder:

- `cosmos.json`: title, positions, links and frames
- `cartes/*.md`: one card per Markdown file
- `manuscrit/`: the text of the scenes (novel)
- `scenario.fountain`: the screenplay text
- `medias/`: images
- `corbeille/`: deleted cards, ready to restore

File and folder names are the same in every language.

```markdown
---
id: k3x9a7bq2m
type: personnage
title: "Inès Morvan"
---
Stand-in keeper. Can’t stand **silence**.
```

**Working on several computers:** put the project folder in iCloud Drive, Dropbox or OneDrive, and avoid opening it on two machines at once. The folder you choose stays allowed from one launch to the next, wherever it is (another drive, OneDrive, a USB stick). If the app can no longer open it, it tells you and you choose it again with “Open folder”.

## Coming next

| Step | Content |
|---|---|
| Screenplay | Target lengths per act in the step outline, emphasis (italic, bold) on screen and in the PDF, side-by-side dual dialogue |
| Mobile | iOS and Android apps |
| Sync | Across devices, then collaboration |

## Platforms

| System | Status |
|---|---|
| macOS (Apple Silicon and Intel), Windows, Linux | Ready: installers built by GitHub Actions |
| iOS, iPadOS, Android | Code is ready (touch, storage), native project still to initialize |
| Browser | For development only (storage in the browser) |

---

## Development

**Stack:** Tauri 2, React 19, strict TypeScript, Vite, React Flow for the canvas, TipTap for the editor, Zustand for state.

### Requirements

- Node 20+ and Rust (https://rustup.rs)
- **Mac:** the Xcode command line tools (`xcode-select --install`)
- **Windows:** the Visual Studio Build Tools (C++) and WebView2 (already on Windows 10 and 11)
- **Linux:** `libwebkit2gtk-4.1-dev` and its dependencies (see `ci.yml`)

### Run

```bash
npm install
npm run tauri dev      # desktop app
# or
npm run dev            # in the browser (http://localhost:1420), no disk access
```

**Mobile (on a Mac):** `npm run tauri ios init` then `npm run tauri ios dev` (Xcode required), or `android init` / `android dev` (Android Studio and NDK required). On mobile, projects live in the app’s private storage.

### Check

```bash
npm run build   # TypeScript check + build
npm test        # tests (Vitest)
```

### Release a version

```bash
git tag v0.1.0 && git push --tags
```

GitHub builds the installers for all three systems and puts them in a draft Release, which you then publish. The secrets needed to sign the apps (Apple developer account, update signing key, Windows certificate) are listed in `release.yml`. A Release published normally (not as a pre-release) is the one the app finds and installs.

### Working on several computers

The code goes through GitHub: `git push` at the end of a session, `git pull` then `npm install` if needed at the start of a session on the other machine. Don’t put the code folder in OneDrive or iCloud.

### Documentation

Architecture, conventions and detailed roadmap: see [CLAUDE.md](CLAUDE.md) (in French), written for working with Claude Code.

## License

Cosmos is free software, released under the [GNU GPL v3.0 or later](LICENSE). You can use, study, change and redistribute it; any modified version you distribute must stay under the same license.

The PDF embeds the Courier Prime font (SIL OFL license, see [OFL.txt](src/assets/fonts/OFL.txt)).

The example project uses Charles Perrault’s “Le Petit Chaperon rouge” (*Histoires ou contes du temps passé*, 1697) and three engravings by Gustave Doré, wood-engraved by Pannemaker (Hetzel edition, 1862), all in the public domain. The English translation of the tale was made for Cosmos.
