// Clipper Status Desk: a little CMS for the Clayton Clipper site's status.yaml: four modes to add, and Entries to change.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ThemeContext, themes, useTw } from "./theme/tw.js";
import { Frame } from "./platform/Frame";
import { useScheme } from "./platform/scheme";
import { BeforeChange, DeskProvider, useDesk } from "./state/desk.js";
import { load, save } from "./platform/storage";
import { Segmented, Body, Notice, Button, Link, Toggle, ZoomScope } from "./components/ui.js";
import { Outbox } from "./components/Outbox.js";
import { VelocityPanel } from "./components/VelocityPanel.js";
import { ReviewSheet } from "./components/ReviewSheet.js";
import { MoveScreen } from "./screens/MoveScreen.js";
import { UpdateScreen } from "./screens/UpdateScreen.js";
import { FollowUpScreen } from "./screens/FollowUpScreen.js";
import { BlogScreen } from "./screens/BlogScreen.js";
import { EntriesScreen } from "./screens/EntriesScreen.js";
import { recentUpdates } from "./lib/entries.js";
import { WaitingEditor } from "./components/WaitingEditor.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { Icon } from "./components/Icon";

const MODES = [
  {
    value: "move",
    label: "Position",
    icon: "crosshair",
    screen: MoveScreen,
    about: "Position only: the span and Hung, with a time stamp.",
  },
  {
    value: "update",
    label: "Update",
    icon: "fileLines",
    screen: UpdateScreen,
    about: "A status update. Its summary goes on the card.",
  },
  {
    value: "followup",
    label: "Follow-up",
    icon: "messageArrowDown",
    screen: FollowUpScreen,
    about: "Add to today's or yesterday's update, or edit a follow-up.",
  },
];
// a blog post is written under Update, with its switch on: each keeps its own draft
const BLOG = { screen: BlogScreen, about: "A dated piece for Trackside. The card stays as it is." };

/** The review of a reopened waiting change sees the files as they were before it, as its editor does. */
const InReview = ({ id, children }) => (id ? <BeforeChange id={id}>{children}</BeforeChange> : children);

function Desk() {
  const { tw, colors } = useTw();
  const desk = useDesk();
  const [settings, setSettings] = useState(false);
  // a desk last left on the old Blog tab opens on Update with its switch on
  const [mode, setModeState] = useState(() => (load("mode", "move") === "blog" ? "update" : load("mode", "move")));
  const setMode = (m) => {
    setModeState(m);
    save("mode", m);
  };
  const [blog, setBlogState] = useState(() => load("blog", false) || load("mode", "move") === "blog");
  const setBlog = (b) => {
    setBlogState(b);
    save("blog", b);
  };
  const [review, setReview] = useState(null); // { change, after, cardLabel, warning }
  const [reopenId, setReopenId] = useState(null); // a waiting change being edited
  const reopened = reopenId ? desk.changes.find((c) => c.id === reopenId) : null;
  const startReview = (change, opts = {}) => setReview({ change, ...opts });
  const reopen = (change) => {
    setReview(null);
    setReopenId(change.id);
  };
  const [entries, setEntries] = useState(false); // the Entries page, apart from the tabs
  // Follow-up is off with no update from today or yesterday to add to (blog posts don't count): left on it, the desk shows
  // Update instead
  const canFollowUp = recentUpdates(desk.parsed).length > 0;
  const modes = MODES.map((m) => (m.value === "followup" ? { ...m, disabled: !canFollowUp } : m));
  const tab = modes.find((m) => m.value === mode && !m.disabled) ?? (mode === "followup" ? modes[1] : modes[0]);
  const blogging = tab.value === "update" && blog;
  const current = blogging ? BLOG : tab;
  const Screen = current.screen;

  return (
    <View style={[tw`w-full gap-3.5 self-center py-5`, { maxWidth: 640 }]}>
      <View style={tw`flex-row items-end justify-between gap-2`}>
        <View style={tw`gap-1`}>
          <Text style={tw`text-xs font-bold uppercase tracking-widest text-mute`}>Clayton Clipper · status.yaml</Text>
          <Text accessibilityRole="header" style={tw`text-2xl font-bold text-ink`}>
            {settings ? "Settings" : "Status desk"}
          </Text>
        </View>
        {settings ? (
          <Button kind="link" title="Done" onPress={() => setSettings(false)} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => setSettings(true)}
            style={({ pressed, hovered }) => [
              tw`h-10 w-10 items-center justify-center rounded-md border border-button-line bg-button-bg`,
              (pressed || hovered) && tw`opacity-80`,
            ]}
          >
            <Icon name="gear" color={colors.ink} size={20} />
          </Pressable>
        )}
      </View>
      {settings && <SettingsScreen />}

      {desk.error && (
        <View style={tw`gap-2`}>
          <Notice tone="problem">{desk.error}</Notice>
          <Button title="Try again" onPress={desk.reload} />
        </View>
      )}
      {!desk.ready && !desk.error && <Body mute>Reading the desk's copy of status.yaml…</Body>}

      {desk.ready && !settings && (
        <>
          <Outbox onSettings={() => setSettings(true)} onEdit={reopen} />
          {!review && !reopened && <VelocityPanel />}
          {review && (
            <View style={tw`gap-3`}>
              <Text accessibilityRole="header" style={tw`text-lg font-bold text-ink`}>
                Review
              </Text>
              <InReview id={reopened?.id}>
                <ReviewSheet
                  change={review.change}
                  cardLabel={review.cardLabel}
                  warning={review.warning}
                  onBack={() => setReview(null)}
                  onSave={(message) => {
                    if (reopened) desk.replaceChange(reopened.id, review.change, message);
                    else desk.addChange(review.change, message);
                    review.after?.();
                    setReview(null);
                    setReopenId(null);
                  }}
                />
              </InReview>
            </View>
          )}
          {/* the screen stays mounted under the review, so saving can clear its draft */}
          <View style={[tw`gap-3`, review && { display: "none" }]}>
            {reopened ? (
              <BeforeChange id={reopened.id}>
                <WaitingEditor
                  key={reopened.id}
                  change={reopened}
                  onCancel={() => setReopenId(null)}
                  onReview={startReview}
                />
              </BeforeChange>
            ) : (
              <>
                {entries ? (
                  <EntriesScreen onReview={startReview} onEditWaiting={reopen} onLeave={() => setEntries(false)} />
                ) : (
                  <>
                    <Segmented options={modes} value={tab.value} onChange={setMode} />
                    {tab.value === "update" && <Toggle label="Blog post" value={blog} onChange={setBlog} />}
                    <Body small mute>
                      {current.about}
                    </Body>
                    <View style={tw`gap-0.5`}>
                      <Link title="Edit or delete what's already saved" onPress={() => setEntries(true)} />
                      <Body small mute>
                        Fix the title, text, photos, gantry step or note to self of any update, blog post, follow-up or
                        position record, or delete it.
                      </Body>
                    </View>
                    <Screen key={blogging ? "blog" : tab.value} onReview={startReview} />
                  </>
                )}
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default function App() {
  const scheme = useScheme();
  return (
    <ThemeContext.Provider value={themes[scheme] ?? themes.light}>
      <DeskProvider>
        <Frame>
          <ZoomScope>
            <Desk />
          </ZoomScope>
        </Frame>
      </DeskProvider>
    </ThemeContext.Provider>
  );
}
