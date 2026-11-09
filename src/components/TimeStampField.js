// A time stamp in BC time, moved a day or a quarter hour at a time, with Now. A date-only stamp (a blog post) moves by days.
// With `auto` (a new entry) it follows the clock, to the quarter hour, and the fields stay hidden until "Set manually" is
// ticked; that lasts an hour (`manualUntil`, kept by the caller in its draft), or until the screen is left or the entry
// is posted, then it's automatic again.
import { useEffect } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { isDateOnly, longDate, clock, nowKey, shiftKey, todayKey } from "../lib/time.js";
import { Body, Button, Checkbox, Label, Panel, Row, Stepper } from "./ui.js";

const MANUAL_MS = 60 * 60 * 1000;
const CHECK_MS = 10 * 1000;

export function TimeStampField({ value, onChange, label = "Time stamp", note, auto, manualUntil, onManual }) {
  const { tw } = useTw();
  const dateOnly = isDateOnly(value);
  const now = dateOnly ? todayKey() : nowKey();
  const follows = !!auto && !dateOnly;
  const manual = follows && manualUntil != null && Date.now() < manualUntil;
  // coming back to this screen starts automatic again
  useEffect(() => {
    if (follows) onManual?.(null);
  }, []);
  // while automatic, keep the stamp on the clock; when the hour of manual is up, go back to automatic
  useEffect(() => {
    if (!follows) return;
    const check = () => {
      if (manualUntil != null && Date.now() >= manualUntil) onManual?.(null);
      else if (manualUntil == null && value !== nowKey()) onChange(nowKey());
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => clearInterval(timer);
  }, [follows, manualUntil, value]);
  if (follows && !manual)
    return (
      <Panel>
        <Label>{label}</Label>
        <Row>
          <Body style={tw`font-semibold`}>{longDate(value)}</Body>
          <Body style={tw`font-semibold`}>{clock(value)}</Body>
        </Row>
        <Body small mute>
          Follows your clock, to the quarter hour. BC time.
        </Body>
        <Checkbox label="Set manually" value={false} onChange={() => onManual?.(Date.now() + MANUAL_MS)} />
      </Panel>
    );
  return (
    <Panel>
      <Label
        right={
          value !== now && <Button kind="grey" small title={dateOnly ? "Today" : "Now"} onPress={() => onChange(now)} />
        }
      >
        {label}
      </Label>
      <Row>
        <Body style={tw`font-semibold`}>{longDate(value)}</Body>
        <Stepper
          label="Day"
          value="Day"
          onMinus={() => onChange(shiftKey(value, -1440))}
          onPlus={() => onChange(shiftKey(value, 1440))}
        />
      </Row>
      {!dateOnly && (
        <Row>
          <Body style={tw`font-semibold`}>{clock(value)}</Body>
          <View style={tw`flex-row gap-2`}>
            <Stepper
              label="Hour"
              value="Hour"
              onMinus={() => onChange(shiftKey(value, -60))}
              onPlus={() => onChange(shiftKey(value, 60))}
            />
            <Stepper
              label="Minutes"
              value=":15"
              onMinus={() => onChange(shiftKey(value, -15))}
              onPlus={() => onChange(shiftKey(value, 15))}
            />
          </View>
        </Row>
      )}
      <Body small mute>
        {note ?? (dateOnly ? "Trackside shows a blog post's date only." : "BC time, to the quarter hour.")}
      </Body>
      {manual && (
        <Checkbox
          label="Set manually"
          value
          onChange={() => {
            onManual?.(null);
            onChange(nowKey());
          }}
        />
      )}
    </Panel>
  );
}
