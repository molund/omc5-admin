// A note's one stored title. On a status update it isn't the heading on the page, which comes from the time stamp: it's the
// link preview and the source of the address, and it's the date title unless Mike writes his own. On a blog post it's the
// heading too.
import { useTw } from "../theme/tw.js";
import { dateTitle, isDateTitle, slugFor, titleAdvice } from "../lib/titles.js";
import { pageHeading } from "../lib/time.js";
import { View } from "react-native";
import { Body, Button, Field, Notice, Row } from "./ui.js";

/**
 * @param {object} props
 * @param {"update"|"blog"} props.kind
 * @param {string} props.stamp The note's time stamp or date.
 * @param {string} props.title
 * @param {(t: string) => void} props.onChange
 * @param {object[]} props.notes The notes in the working copy.
 * @param {string} [props.address] Editing a saved note: its address, which stays whatever the title.
 */
export function TitleField({ kind, stamp, title, onChange, notes, address }) {
  const { tw } = useTw();
  const advice = titleAdvice(kind, stamp, title);
  const slug = address ?? (title.trim() ? slugFor(title.trim(), stamp, notes) : "");
  const usingDate = isDateTitle(title);
  return (
    <View style={tw`gap-1.5`}>
      <Field
        multiline
        heading="Title"
        right={
          !title.trim() || isDateTitle(title) ? null : (
            <Body small mute>
              {title.trim().length}/60
            </Body>
          )
        }
        value={title}
        onChangeText={(t) => onChange(t.replace(/\n/g, " "))}
        placeholder={kind === "blog" ? "In sentence case" : "Your own title"}
        label="Title"
        style={tw`min-h-14`}
      />
      {kind === "update" && (
        <Body small mute>
          {`Page heading, from the time stamp: ${pageHeading(stamp)}`}
        </Body>
      )}
      {slug ? (
        <Body small mute style={tw`font-mono`}>
          ?post={slug}
        </Body>
      ) : null}
      {kind === "update" && (
        <Row>
          <Body small mute>
            {usingDate ? "The date title." : "Your own title."}
          </Body>
          {usingDate ? (
            <Button kind="link" small title="Write your own" onPress={() => onChange("")} />
          ) : (
            <Button kind="link" small title="Use the date title" onPress={() => onChange(dateTitle(stamp))} />
          )}
        </Row>
      )}
      {advice.problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      {advice.warnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}
    </View>
  );
}

/** Whether the title can be saved. */
export const titleProblems = (kind, stamp, title) => titleAdvice(kind, stamp, title).problems;
