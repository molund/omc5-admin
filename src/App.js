// Clipper Status Desk: a little CMS for the Clayton Clipper site's status.yaml. It opens on Home (screens/HomeScreen.js),
// and every form opens as its own page over it, on a stack: Back, or a swipe from the left edge, goes back one.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ThemeContext, themes, useTw } from "./theme/tw.js";
import { Frame } from "./platform/Frame";
import { useScheme } from "./platform/scheme";
import { BeforeChange, DeskProvider, useDesk } from "./state/desk.js";
import { Body, Notice, Button, ZoomScope } from "./components/ui.js";
import { ReviewSheet } from "./components/ReviewSheet.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { MoveScreen } from "./screens/MoveScreen.js";
import { UpdateScreen } from "./screens/UpdateScreen.js";
import { FollowUpScreen } from "./screens/FollowUpScreen.js";
import { BlogScreen } from "./screens/BlogScreen.js";
import { EntriesScreen } from "./screens/EntriesScreen.js";
import { recentUpdates } from "./lib/entries.js";
import { WaitingEditor } from "./components/WaitingEditor.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { Icon } from "./components/Icon";

// the pages over Home: their titles, and for the ways to add something, what each one is
const PAGES = {
  move: { title: "Position", screen: MoveScreen, about: "Position only: the span and Hung, with a time stamp." },
  update: { title: "Update", screen: UpdateScreen, about: "A status update. Its summary goes on the card." },
  followup: {
    title: "Follow-up",
    screen: FollowUpScreen,
    about: "Add to today's or yesterday's update, or edit a follow-up.",
  },
  blog: { title: "Blog post", screen: BlogScreen, about: "A dated piece for Trackside. The card stays as it is." },
  entries: { title: "Entries" },
  waiting: { title: "Waiting change" },
  settings: { title: "Settings" },
};

/** The review of a reopened waiting change sees the files as they were before it, as its editor does. */
const InReview = ({ id, children }) => (id ? <BeforeChange id={id}>{children}</BeforeChange> : children);

function Desk() {
  const { tw, colors } = useTw();
  const desk = useDesk();
  // the pages open, Home first: { page }, or { page: "waiting", id } for a waiting change reopened
  const [stack, setStack] = useState([{ page: "home" }]);
  const top = stack[stack.length - 1];
  const go = (page, more) => setStack((s) => [...s, { page, ...more }]);
  const [review, setReview] = useState(null); // { change, after, cardLabel, warning }
  const reopened = top.page === "waiting" ? desk.changes.find((c) => c.id === top.id) : null;
  const startReview = (change, opts = {}) => setReview({ change, ...opts });
  const reopen = (change) => {
    setReview(null);
    go("waiting", { id: change.id });
  };
  // Back closes a review first, then the page
  const back = () => {
    if (review) return setReview(null);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  const home = top.page === "home";
  const page = PAGES[top.page];
  const canFollowUp = recentUpdates(desk.parsed).length > 0;

  let screen = null;
  if (top.page === "home") screen = <HomeScreen go={go} onEdit={reopen} />;
  else if (top.page === "settings") screen = <SettingsScreen />;
  else if (top.page === "entries") screen = <EntriesScreen onReview={startReview} onEditWaiting={reopen} />;
  else if (top.page === "waiting")
    screen = reopened ? (
      <BeforeChange id={reopened.id}>
        <WaitingEditor key={reopened.id} change={reopened} onCancel={back} onReview={startReview} />
      </BeforeChange>
    ) : (
      <Notice>That change isn't waiting any more.</Notice>
    );
  else if (top.page === "followup" && !canFollowUp)
    screen = <Notice>There's no update from today or yesterday to add to.</Notice>;
  else {
    const Screen = page.screen;
    screen = <Screen key={top.page} onReview={startReview} />;
  }

  return (
    <View style={[tw`w-full gap-3.5 self-center py-5`, { maxWidth: 640 }]}>
      <View style={tw`flex-row items-end justify-between gap-2`}>
        <View style={tw`flex-1 gap-1`}>
          {home ? (
            <Text style={tw`text-xs font-bold uppercase tracking-widest text-mute`}>Clayton Clipper · status.yaml</Text>
          ) : (
            <Button kind="link" small title="‹ Back" style={tw`self-start py-0`} onPress={back} />
          )}
          <Text accessibilityRole="header" style={tw`text-2xl font-bold text-ink`}>
            {review ? "Review" : home ? "Status desk" : page.title}
          </Text>
          {!review && page?.about && (
            <Body small mute>
              {page.about}
            </Body>
          )}
        </View>
        {home && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => go("settings")}
            style={({ pressed, hovered }) => [
              tw`h-10 w-10 items-center justify-center rounded-md border border-button-line bg-button-bg`,
              (pressed || hovered) && tw`opacity-80`,
            ]}
          >
            <Icon name="gear" color={colors.ink} size={20} />
          </Pressable>
        )}
      </View>

      {desk.error && (
        <View style={tw`gap-2`}>
          <Notice tone="problem">{desk.error}</Notice>
          <Button title="Try again" onPress={desk.reload} />
        </View>
      )}
      {!desk.ready && !desk.error && <Body mute>Reading the desk's copy of status.yaml…</Body>}

      {(desk.ready || top.page === "settings") && (
        <>
          {review && (
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
                  // saved: back to where the page was opened from (saving clears every form's draft)
                  setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
                }}
              />
            </InReview>
          )}
          {/* the page stays mounted under the review, so going back to it keeps it as it was */}
          <View style={[tw`gap-3`, review && { display: "none" }]}>{screen}</View>
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
