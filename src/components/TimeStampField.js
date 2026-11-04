// A time stamp in BC time, moved a day or a quarter hour at a time, with Now. A date-only stamp (a blog post) moves by days.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { isDateOnly, longDate, clock, nowKey, shiftKey, todayKey } from "../lib/time.js";
import { Body, Button, Label, Panel, Row, Stepper } from "./ui.js";

export function TimeStampField({ value, onChange, label = "Time stamp", note }) {
  const { tw } = useTw();
  const dateOnly = isDateOnly(value);
  const now = dateOnly ? todayKey() : nowKey();
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
    </Panel>
  );
}
