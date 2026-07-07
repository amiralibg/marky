import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { slashCommands } from "./wikiLinkAutocomplete";

const complete = (doc, pos) => slashCommands({ state: EditorState.create({ doc }), pos });
const labels = (res) => (res ? res.options.map((o) => o.label) : null);

describe("slashCommands", () => {
  it("offers every block, anchored just after the slash so the query filters", () => {
    // "Some text\n/" — slash at index 10, cursor at 11.
    const res = complete("Some text\n/", 11);
    expect(labels(res)).toEqual(
      expect.arrayContaining(["Heading 1", "Bullet list", "Code block", "Divider", "Table"])
    );
    // Anchored AFTER the slash (11), not on it — otherwise CodeMirror filters
    // labels against "/" and matches nothing.
    expect(res.from).toBe(11);
  });

  it("does not trigger mid-line or inside a word", () => {
    expect(complete("hello /", 7)).toBeNull();
    expect(complete("a/b", 2)).toBeNull();
  });

  it("apply deletes the leading slash, inserts the block, and sets the caret", () => {
    const res = complete("/", 1); // slash at 0, query anchor at 1
    const codeBlock = res.options.find((o) => o.label === "Code block");
    const dispatched = [];
    const view = { dispatch: (tr) => dispatched.push(tr), focus: () => {} };
    // CodeMirror calls apply(view, completion, from=res.from, to=cursor)
    codeBlock.apply(view, codeBlock, res.from, 1);
    expect(dispatched[0].changes.from).toBe(0); // removes the "/"
    expect(dispatched[0].changes.insert).toBe("```\n\n```");
    expect(dispatched[0].selection.anchor).toBe(4); // between the fences
  });
});
