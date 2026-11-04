// The title, with the rules from CLAUDE.md: a day's only update gets the date title; a day with more than one gets
// headlines, and an earlier date-titled update on that day is offered one too (keeping its address with a slug:).
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { dateTitle, isDateTitle, slugFor, slugsOf, titleAdvice } from "../lib/titles.js";
import { clock } from "../lib/time.js";
import { Body, Button, Field, Label, Notice, Panel, Row } from "./ui.js";

/**
 * @param {object} props
 * @param {"update"|"blog"} props.kind
 * @param {string} props.stamp The note's time stamp or date.
 * @param {string} props.title
 * @param {(t: string) => void} props.onChange
 * @param {object[]} props.notes The notes in the working copy.
 * @param {Record<string,string>} props.retitles Headlines for the day's other updates, by key.
 * @param {(r: Record<string,string>) => void} props.onRetitle
 */
export function TitleField({ kind, stamp, title, onChange, notes, retitles = {}, onRetitle }) {
  const { tw } = useTw();
  const advice = titleAdvice(kind, stamp, title, notes);
  const slug = title.trim() ? slugFor(title.trim(), stamp, notes) : "";
  const usingDate = isDateTitle(title);
  const slugs = slugsOf(notes);
  return (
    <Panel>
      <Label right={!title.trim() || isDateTitle(title) ? null : <Body small mute>{title.trim().length}/60</Body>}>
        {kind === "blog" ? "Title · leads the post" : "Title"}
      </Label>
      <Field
        multiline
        value={title}
        onChangeText={(t) => onChange(t.replace(/\n/g, " "))}
        placeholder={kind === "blog" ? "A headline, in sentence case" : "Title"}
        label="Title"
        style={tw`min-h-14`}
      />
      {slug ? (
        <Body small mute style={tw`font-mono`}>
          ?post={slug}
        </Body>
      ) : null}
      {kind === "update" && (
        <Row>
          <Body small mute>
            {advice.sameDay.length
              ? `${advice.sameDay.length === 1 ? "Another update is" : `${advice.sameDay.length} updates are`} on this day: write a headline.`
              : usingDate
                ? "The day's only update: the date title."
                : "The day's only update: the date title, unless there's news to tell."}
          </Body>
          {!advice.sameDay.length &&
            (usingDate ? (
              <Button kind="link" small title="Write a headline" onPress={() => onChange("")} />
            ) : (
              <Button kind="link" small title="Use the date title" onPress={() => onChange(dateTitle(stamp))} />
            ))}
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
      {advice.retitle.map((n) => (
        <View key={n.key} style={tw`gap-1.5 rounded-md border border-dashed border-line p-2.5`}>
          <Body small>
            The {clock(n.key)} update has the date title. Give it a headline too, so the two don't share one. Its address
            stays ?post={slugs.get(n.key)}.
          </Body>
          <Field
            small
            value={retitles[n.key] ?? ""}
            onChangeText={(t) => onRetitle({ ...retitles, [n.key]: t })}
            placeholder={`A headline for: ${n.fields.summary.slice(0, 60)}…`}
            label={`Headline for the ${clock(n.key)} update`}
          />
        </View>
      ))}
    </Panel>
  );
}

/** Whether the title can be saved. */
export function titleProblems(kind, stamp, title, notes, retitles = {}) {
  const advice = titleAdvice(kind, stamp, title, notes);
  const missing = advice.retitle.filter((n) => !(retitles[n.key] ?? "").trim());
  return [...advice.problems, ...(missing.length ? ["Give the day's other update a headline too."] : [])];
}

/** The retitle list for an update change: [{ key, title, slug }]. */
export function retitleList(stamp, title, notes, retitles = {}) {
  const advice = titleAdvice("update", stamp, title, notes);
  const slugs = slugsOf(notes);
  return advice.retitle.map((n) => ({ key: n.key, title: retitles[n.key].trim(), slug: slugs.get(n.key) }));
}
