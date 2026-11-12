// Settings: the GitHub token the phone pushes with (kept in the Keychain; see platform/secrets), the kept sparkle prompts
// (lib/promptLog.js), shared as a zip, and where commits go. The Claude app version has no token: it pushes through Claude
// Code.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { canKeepToken, removeToken, saveToken } from "../platform/secrets";
import { BRANCH, checkToken, NEW_TOKEN_URL, REPO_NAME, AUTHOR } from "../services/github.js";
import { zipSync, strToU8 } from "fflate";
import { dateOf, todayKey } from "../lib/time.js";
import { clearPromptLog, promptFiles, promptLog } from "../lib/promptLog.js";
import { PROMPT_VERSION } from "../platform/promptVersion";
import { shareFile } from "../platform/shareFile";
import { Body, Button, Confirm, Field, Label, Link, Notice, Panel, Row } from "../components/ui.js";
import { Icon } from "../components/Icon";

function TokenForm({ onSaved, onCancel }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const info = await checkToken(value);
      await saveToken(value.trim());
      desk.setTokenInfo({ ...info, rejected: false });
      setValue("");
      onSaved?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Body small mute>
        {`Push needs a fine-grained token: repository ${REPO_NAME} only, Contents: read and write, and Actions: read-only (so the Leash Log can follow a push more closely), nothing else, with an expiry date. Paste it once; it's kept in this iPhone's Keychain and never shown again.`}
      </Body>
      <Field
        value={value}
        onChangeText={setValue}
        placeholder="github_pat_…"
        label="GitHub token"
        mono
        secure
        noPrompt
      />
      {error && <Notice tone="problem">{error.message}</Notice>}
      <Row style={tw`justify-start`}>
        <Button
          kind="green"
          title={busy ? "Checking…" : "Check and save"}
          disabled={busy || !value.trim()}
          onPress={save}
        />
        {onCancel && <Button title="Cancel" onPress={onCancel} />}
        <Link href={NEW_TOKEN_URL} title="Make a token on GitHub" />
      </Row>
    </>
  );
}

function SavedToken({ info }) {
  const { tw, colors } = useTw();
  const desk = useDesk();
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const expired = info.expiresAt && new Date(info.expiresAt) < Date.now();
  const ok = !info.rejected && !expired;

  if (replacing) return <TokenForm onSaved={() => setReplacing(false)} onCancel={() => setReplacing(false)} />;
  return (
    <>
      <Row>
        <Body style={tw`font-mono`}>{`github_pat_••••••••${info.last4}`}</Body>
        <View style={tw`flex-row items-center gap-1`}>
          {ok && <Icon name="check" color={colors.green} />}
          <Body small mute>
            {ok ? "Works" : expired ? "Expired" : "Rejected by GitHub"}
          </Body>
        </View>
      </Row>
      <Body small mute>
        {`${REPO_NAME} · ${info.expiresAt ? `${expired ? "expired" : "expires"} ${dateOf(info.expiresAt)}` : "never expires"}`}
      </Body>
      {!info.expiresAt && <Notice>This token never expires. A token with an expiry date is safer.</Notice>}
      <Body small mute>
        Kept in this iPhone's Keychain, on this device only. Push asks for Face ID each time.
      </Body>
      {removing ? (
        <View style={tw`gap-2 rounded-md bg-bg p-2.5`}>
          <Body small>Remove the token from this iPhone? Push won't work until you paste one again.</Body>
          <Row style={tw`justify-end`}>
            <Button small title="Cancel" onPress={() => setRemoving(false)} />
            <Button
              small
              kind="danger"
              title="Remove"
              onPress={async () => {
                await removeToken().catch(() => {});
                desk.setTokenInfo(null);
                setRemoving(false);
              }}
            />
          </Row>
        </View>
      ) : (
        <Row style={tw`justify-start`}>
          <Button small title="Replace" onPress={() => setReplacing(true)} />
          <Button small kind="danger" title="Remove" onPress={() => setRemoving(true)} />
        </Row>
      )}
    </>
  );
}

/** The kept sparkle prompts: how many, shared as a zip of a .txt (the prompt) and a .json (its inputs) for each, or cleared. */
function SparklePrompts() {
  const { tw } = useTw();
  const [log, setLog] = useState(promptLog);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);
  const n = log.length;

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const files = Object.entries(promptFiles(log)).map(([name, text]) => [name, strToU8(text)]);
      await shareFile(`sparkle-prompts-${todayKey()}.zip`, zipSync(Object.fromEntries(files)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <Label>Sparkle prompts</Label>
      <Body small mute>
        Every prompt the sparkle icon copies is saved here with its inputs, as test data for evaluating models and
        prompts when enhancing the AI writing feature later.
      </Body>
      {!n ? (
        <Body small mute>
          No prompts kept yet.
        </Body>
      ) : (
        <>
          <Body small>{`${n} prompt${n === 1 ? "" : "s"} kept since ${dateOf(log[0].at)}`}</Body>
          <Body small mute>{`Prompt version ${PROMPT_VERSION}`}</Body>
          {error && <Notice tone="problem">{error}</Notice>}
          {clearing ? (
            <Confirm
              action="Clear"
              onCancel={() => setClearing(false)}
              onConfirm={() => {
                clearPromptLog();
                setLog([]);
                setClearing(false);
              }}
            >
              {`Clear the ${n} kept prompt${n === 1 ? "" : "s"}? Share them first if you want them.`}
            </Confirm>
          ) : (
            <Row style={tw`justify-start`}>
              <Button small title={busy ? "Zipping…" : "Share as zip…"} disabled={busy} onPress={share} />
              <Button small kind="danger" title="Clear" onPress={() => setClearing(true)} />
            </Row>
          )}
        </>
      )}
    </Panel>
  );
}

export function SettingsScreen() {
  const { tw } = useTw();
  const desk = useDesk();
  return (
    <View style={tw`gap-3`}>
      <Panel>
        <Label>GitHub token</Label>
        {!canKeepToken ? (
          <Body small mute>
            The Claude app version of the Leash Log has no token: Push hands the changes to Claude Code, which commits
            them. The token is only for the iPhone app.
          </Body>
        ) : desk.tokenInfo ? (
          <SavedToken info={desk.tokenInfo} />
        ) : (
          <TokenForm />
        )}
      </Panel>
      <SparklePrompts />
      <Panel>
        <Label>Commits</Label>
        <Body small mute>
          {canKeepToken
            ? `Author: ${AUTHOR.name} · pushed to the ${BRANCH} branch, which lands on main after its checks.`
            : "Author: Mike Olund (Claude app) · committed by Claude Code, straight to main."}
        </Body>
      </Panel>
    </View>
  );
}
