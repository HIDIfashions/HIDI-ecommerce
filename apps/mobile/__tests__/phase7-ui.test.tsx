import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
import { TextInput } from "react-native";
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ session: null }) }));
jest.mock("../src/data/CartContext", () => ({ useCart: () => ({ cart: null, stale: false, refresh: jest.fn() }) }));
jest.mock("../src/components/HidiScreen", () => ({ HidiScreen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../src/theme/HidiTheme", () => ({ useHidiTheme: () => ({ mode: "light", colors: require("../src/theme/tokens").hidiColors.light }) }));
jest.mock("lucide-react-native", () => ({ Clock3: "ClockIcon", Gift: "GiftIcon", ShieldCheck: "ShieldIcon", ArrowLeft: "BackIcon", CircleHelp: "HelpIcon" }));
import GrowthScreen, { CircleView, GiftForm, ReferralView } from "../src/growth/GrowthScreen";
import { GrowthEntryPoints } from "../src/growth/GrowthEntryPoints";
import { GrowthProvider } from "../src/growth/runtime";
import { HidiButton } from "../src/components/HidiButton";
import { campaign, circle, gift, NOW, runtime } from "../test-fixtures/growth";

let trees: ReactTestRenderer[] = [];
async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(node); }); trees.push(tree); return tree;
}
afterEach(async () => { await act(async () => { trees.forEach(tree => tree.unmount()); }); trees = []; });

describe("Phase 7 actual React Native screen rendering", () => {
  it("renders no account or bag entry while the feature flags are off", async () => {
    const r = runtime(); r.flags = { circle: false, referrals: false, gifting: false };
    const tree = await render(<GrowthProvider runtime={r}><GrowthEntryPoints area="account" onOpen={jest.fn()} /><GrowthEntryPoints area="bag" onOpen={jest.fn()} /></GrowthProvider>);
    expect(tree.toJSON()).toBeNull();
  });
  it("does not expose entries merely because a flag is on with no supported adapter", async () => {
    const r = runtime(); r.capabilities = { circle: false, referrals: false, gifting: false };
    expect((await render(<GrowthProvider runtime={r}><GrowthEntryPoints area="account" onOpen={jest.fn()} /></GrowthProvider>)).toJSON()).toBeNull();
  });
  it("guards direct navigation to a disabled feature without a network request", async () => {
    const r = runtime(); r.flags = { circle: false, referrals: false, gifting: false };
    const tree = await render(<GrowthProvider runtime={r}><GrowthScreen navigation={{ canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() } as never} route={{ key: "growth", name: "Growth", params: { feature: "circle" } }} /></GrowthProvider>);
    expect(JSON.stringify(tree.toJSON())).toContain("not active"); expect(r.services.readCircle).not.toHaveBeenCalled();
  });
  it("renders H119 points, terms and expandable activity with one primary action", async () => {
    const tree = await render(<CircleView account={circle} now={NOW} onRefresh={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("not a cash balance");
    expect(tree.root.findAllByType(HidiButton)).toHaveLength(1);
    await act(async () => tree.root.findByType(HidiButton).props.onPress());
    expect(tree.root.findAllByProps({ testID: "circle-ledger" }).length).toBeGreaterThan(0);
  });
  it("renders H120 expired campaign with sharing disabled and no automatic action", async () => {
    const share = jest.fn(); const tree = await render(<ReferralView campaign={campaign} now={Date.parse(campaign.endsAt)} busy={false} message="" onShare={share} onRefresh={jest.fn()} />);
    expect(tree.root.findByType(HidiButton).props.disabled).toBe(true); expect(share).not.toHaveBeenCalled();
  });
  it("renders H127 note editing without sending anything on type or packaging selection", async () => {
    const onDraft = jest.fn(); const onSave = jest.fn(); const tree = await render(<GiftForm options={gift} draft={gift.selected} onDraft={onDraft} busy={false} unknown={false} message="" onSave={onSave} onReconcile={jest.fn()} onBack={jest.fn()} now={NOW} />);
    await act(async () => tree.root.findByType(TextInput).props.onChangeText("  Keep this exact note  "));
    expect(onDraft).toHaveBeenCalledWith({ note: "  Keep this exact note  ", packagingId: null }); expect(onSave).not.toHaveBeenCalled();
    expect(tree.root.findByType(HidiButton).props.label).toBe("Save gift options");
  });
  it("replaces Save with read-only status recovery for an ambiguous gift write", async () => {
    const tree = await render(<GiftForm options={gift} draft={gift.selected} onDraft={jest.fn()} busy={false} unknown message="Uncertain" onSave={jest.fn()} onReconcile={jest.fn()} onBack={jest.fn()} now={NOW} />);
    expect(tree.root.findByType(HidiButton).props.label).toBe("Check gift status"); expect(tree.root.findByType(TextInput).props.editable).toBe(false);
  });
});
