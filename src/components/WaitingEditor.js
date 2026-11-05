// A waiting change, reopened in the editor it came from. It's shown inside BeforeChange (state/desk.js), so the screen sees
// the files as they were before this change and doesn't clash with itself. Its draft isn't kept: the change stays as it was
// until the new version is saved, so Cancel, or closing the app, loses only the edits.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { reopenAs } from "../lib/entries.js";
import { headerOf } from "../lib/statusFile.js";
import { BlogScreen } from "../screens/BlogScreen.js";
import { FollowUpScreen } from "../screens/FollowUpScreen.js";
import { MoveScreen } from "../screens/MoveScreen.js";
import { UpdateScreen } from "../screens/UpdateScreen.js";
import { EntryEditor } from "./EntryEditor.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

const SCREENS = { move: MoveScreen, update: UpdateScreen, followup: FollowUpScreen, blog: BlogScreen };

function SavedEntry({ target, seed, onCancel, onReview }) {
  const desk = useDesk();
  const [d, update] = useDraft(null, () => seed);
  // a note's edit doesn't say which it is: the note does
  const post = desk.parsed.notes.find((n) => n.key === target.key)?.fields.post;
  const resolved = target.type === "note" ? { ...target, type: post ? "blog" : "update" } : target;
  return <EntryEditor target={resolved} draft={d} update={update} onClose={onCancel} onReview={onReview} noDelete />;
}

export function WaitingEditor({ change, onCancel, onReview }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [plan] = useState(() => reopenAs(change, headerOf(desk.parsed)));
  const Screen = SCREENS[plan.screen];
  return (
    <View style={tw`gap-3`}>
      <Panel>
        <Row>
          <Label>Editing a waiting change</Label>
          <Button kind="link" small title="Cancel" onPress={onCancel} />
        </Row>
        <Body small mute>
          {change.message}. It keeps its place in the list.
        </Body>
      </Panel>
      {Screen ? (
        <Screen draftKey={null} seed={plan.seed} onReview={onReview} />
      ) : (
        <SavedEntry target={plan.target} seed={plan.seed} onCancel={onCancel} onReview={onReview} />
      )}
    </View>
  );
}
