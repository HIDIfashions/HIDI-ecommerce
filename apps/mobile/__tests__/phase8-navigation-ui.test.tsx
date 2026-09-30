import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
import { Pressable, StyleSheet, Text } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
const mockDimensions = { width: 320, height: 844, fontScale: 2, scale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock("../src/theme/HidiTheme", () => ({ useHidiTheme: () => ({ colors: require("../src/theme/tokens").hidiColors.light }) }));
jest.mock("lucide-react-native", () => ({ Grid2X2: "ShopIcon", Heart: "SavedIcon", House: "HomeIcon", ShoppingBag: "BagIcon", UserRound: "YouIcon" }));
import { ResponsiveTabBar } from "../src/navigation/ResponsiveTabBar";
const trees: ReactTestRenderer[] = [];
async function render(node: React.ReactElement) { let tree!: ReactTestRenderer; await act(async () => { tree = renderer.create(node); }); trees.push(tree); return tree; }
afterEach(async () => { await act(async () => { trees.splice(0).forEach(tree => tree.unmount()); }); });
function props() {
  const routes = ["Home", "Shop", "Saved", "Bag", "You"].map(name => ({ key: name, name }));
  return { state: { index: 0, routes }, descriptors: Object.fromEntries(routes.map(r => [r.key, { options: {} }])), insets: { bottom: 24, top: 0, left: 0, right: 0 }, navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() } };
}
it("AT-10 preserves five full labels and 48dp targets at 320dp/200%", async () => {
  const p = props(); const tree = await render(<ResponsiveTabBar {...(p as unknown as BottomTabBarProps)} />);
  const tabs = tree.root.findAllByType(Pressable);
  expect(tabs).toHaveLength(5);
  for (const tab of tabs) { expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(48); expect(StyleSheet.flatten(tab.props.style).flexBasis).toBe("33.333333%"); }
  const labels = tree.root.findAllByType(Text); expect(labels.map(t => t.props.children)).toEqual(["Home", "Shop", "Saved", "Bag", "You"]);
  expect(labels.every(t => t.props.numberOfLines === undefined && t.props.allowFontScaling === true)).toBe(true);
});
it("tab navigation emits the preventable event before selecting a destination", async () => {
  const p = props(); const tree = await render(<ResponsiveTabBar {...(p as unknown as BottomTabBarProps)} />);
  await act(async () => tree.root.findAllByType(Pressable)[1]!.props.onPress());
  expect(p.navigation.emit).toHaveBeenCalledWith({ type: "tabPress", target: "Shop", canPreventDefault: true });
  expect(p.navigation.navigate).toHaveBeenCalledWith("Shop", undefined);
});
