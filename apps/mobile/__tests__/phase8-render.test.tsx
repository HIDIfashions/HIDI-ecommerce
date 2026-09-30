import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
import { TextInput } from "react-native";
jest.mock("../src/theme/HidiTheme", () => ({ useHidiTheme: () => ({ mode: "light", colors: require("../src/theme/tokens").hidiColors.light }) }));
jest.mock("../src/components/HidiScreen", () => ({ HidiScreen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("lucide-react-native", () => ({ CreditCard: "CardIcon", Smartphone: "PhoneIcon", ArrowLeft: "BackIcon", CircleHelp: "HelpIcon" }));
import { HidiField } from "../src/components/HidiField";
import { HidiButton } from "../src/components/HidiButton";
import { SecureCardCheckoutScreen, UpiHandoffScreen } from "../src/screens/checkout/PaymentHandoffScreens";
const trees: ReactTestRenderer[] = [];
async function render(node: React.ReactElement) { let tree!: ReactTestRenderer; await act(async () => { tree = renderer.create(node); }); trees.push(tree); return tree; }
afterEach(async () => { await act(async () => { trees.splice(0).forEach(tree => tree.unmount()); }); });
it("AT-10 H048 associates a readable label and error with the input", async () => {
  const tree = await render(<HidiField label="PIN code" value="12" error="Enter a six-digit PIN" />);
  expect(tree.root.findByType(TextInput).props.accessibilityLabel).toBe("PIN code");
  expect(tree.root.findByType(TextInput).props.accessibilityHint).toBe("Enter a six-digit PIN");
  expect(tree.root.findAllByProps({ accessibilityRole: "alert" }).length).toBeGreaterThan(0);
});
it.each([UpiHandoffScreen, SecureCardCheckoutScreen])("H053/H054 cannot issue a financial write without the provider bridge", async Screen => {
  const fetchSpy = jest.spyOn(globalThis, "fetch");
  const back = jest.fn();
  const tree = await render(<Screen navigation={{ goBack: back, navigate: jest.fn() } as never} route={{} as never} />);
  expect(JSON.stringify(tree.toJSON())).toContain("No order, stock reservation or payment attempt");
  expect(tree.root.findAllByType(HidiButton)).toHaveLength(1);
  await act(async () => tree.root.findByType(HidiButton).props.onPress());
  expect(back).toHaveBeenCalledTimes(1); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
});
