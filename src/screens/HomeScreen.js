// Home: where the desk opens. The gantry's velocity, a button for each way to add something, the way to what's already
// saved, and the desk's copy with its waiting changes. Each button opens its page (App.js), and Back comes home again.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { listEntries, recentUpdates } from "../lib/entries.js";
import { Body, Button, Label, Link, Panel } from "../components/ui.js";
import { Outbox } from "../components/Outbox.js";
import { VelocityPanel } from "../components/VelocityPanel.js";
import { EntryRows } from "./EntriesScreen.js";

const RECENT = 3; // the entries shown, newest first

/**
 * @param {object} props
 * @param {(page: string) => void} props.go Opens a page: "move", "update", "followup", "blog", "velocity", "entries" or
 *   "settings".
 * @param {(change: object) => void} props.onEdit Reopens a waiting change.
 * @param {(target: object) => void} props.onOpen Opens a saved entry.
 */
export function HomeScreen({ go, onEdit, onOpen }) {
  const { tw } = useTw();
  const desk = useDesk();
  // a follow-up adds to an update from today or yesterday (blog posts don't count)
  const canFollowUp = recentUpdates(desk.parsed).length > 0;
  const recent = listEntries(desk.parsed, desk.deskEntries).slice(0, RECENT);
  const add = (title, page, disabled) => (
    <Button title={title} disabled={disabled} style={tw`flex-1`} onPress={() => go(page)} />
  );
  return (
    <View style={tw`gap-3.5`}>
      <VelocityPanel onOpen={() => go("velocity")} />
      <Outbox onSettings={() => go("settings")} onEdit={onEdit} />
      <View style={tw`gap-2`}>
        <Label>Add</Label>
        <View style={tw`flex-row gap-2`}>
          {add("Position", "move")}
          {add("Update", "update")}
        </View>
        <View style={tw`flex-row gap-2`}>
          {add("Addendum", "followup", !canFollowUp)}
          {add("Blog post", "blog")}
        </View>
        {!canFollowUp && (
          <Body small mute>
            An addendum needs an update from today or yesterday to add to.
          </Body>
        )}
      </View>
      <Panel>
        <Label>Edit what's saved</Label>
        {recent.length ? (
          <View>
            <EntryRows entries={recent} onOpen={onOpen} />
          </View>
        ) : (
          <Body small mute>
            Nothing has been saved yet.
          </Body>
        )}
        <Link title="All entries ›" onPress={() => go("entries")} />
      </Panel>
    </View>
  );
}
