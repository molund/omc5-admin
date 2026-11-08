// Home: where the desk opens. The gantry's velocity, a button for each way to add something, the way to what's already
// saved, and the desk's copy with its waiting changes. Each button opens its page (App.js), and Back comes home again.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { recentUpdates } from "../lib/entries.js";
import { Body, Button, Label, Link, Panel } from "../components/ui.js";
import { Outbox } from "../components/Outbox.js";
import { VelocityPanel } from "../components/VelocityPanel.js";

/**
 * @param {object} props
 * @param {(page: string) => void} props.go Opens a page: "move", "update", "followup", "blog", "entries" or "settings".
 * @param {(change: object) => void} props.onEdit Reopens a waiting change.
 */
export function HomeScreen({ go, onEdit }) {
  const { tw } = useTw();
  const desk = useDesk();
  // a follow-up adds to an update from today or yesterday (blog posts don't count)
  const canFollowUp = recentUpdates(desk.parsed).length > 0;
  const add = (title, page, disabled) => (
    <Button title={title} disabled={disabled} style={tw`flex-1`} onPress={() => go(page)} />
  );
  return (
    <View style={tw`gap-3.5`}>
      <VelocityPanel />
      <View style={tw`gap-2`}>
        <Label>Add</Label>
        <View style={tw`flex-row gap-2`}>
          {add("Position", "move")}
          {add("Update", "update")}
        </View>
        <View style={tw`flex-row gap-2`}>
          {add("Follow-up", "followup", !canFollowUp)}
          {add("Blog post", "blog")}
        </View>
        {!canFollowUp && (
          <Body small mute>
            Follow-up needs an update from today or yesterday to add to.
          </Body>
        )}
      </View>
      <Panel>
        <Label>Edit what's saved</Label>
        <Body small mute>
          Fix the title, text, photos, gantry step or working notes of any update, blog post, follow-up or position
          record, or delete it.
        </Body>
        <Link title="All entries ›" onPress={() => go("entries")} />
      </Panel>
      <Outbox onSettings={() => go("settings")} onEdit={onEdit} />
    </View>
  );
}
