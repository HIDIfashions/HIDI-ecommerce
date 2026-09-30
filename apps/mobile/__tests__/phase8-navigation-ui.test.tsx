import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
import { StyleSheet } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
const mockDimensions = { width: 320, height: 844, fontScale: 2, scale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock("../src/theme/HidiTheme", () => ({ useHidiTheme: () => ({ colors: require("../src/theme/tokens").hidiColors.light }) }));
jest.mock("lucide-react-native", () => ({ Grid2X2: "ShopIcon", Heart: "SavedIcon", House: "HomeIcon", ShoppingBag: "BagIcon", UserRound: "YouIcon" }));
import { ResponsiveTabBar } from "../src/navigation/ResponsiveTabBar";
const trees: ReactTestRenderer[] = [];
const routeNames = ["Home", "Shop", "Saved", "Bag", "You"];
async function render(node: React.ReactElement) { let tree!: ReactTestRenderer; await act(async () => { tree = renderer.create(node); }); trees.push(tree); return tree; }
afterEach(async () => { await act(async () => { trees.splice(0).forEach(tree => tree.unmount()); }); });
function props() {
  const routes = routeNames.map(name => ({ key: name, name }));
  return { state: { index: 0, routes }, descriptors: Object.fromEntries(routes.map(r => [r.key, { options: {} }])), insets: { bottom: 24, top: 0, left: 0, right: 0 }, navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() } };
}
it("AT-10 preserves five full labels and 48dp targets at 320dp/200%", async () => {
  const p = props(); const tree = await render(<ResponsiveTabBar {...(p as unknown as BottomTabBarProps)} />);
  // Test the rendered semantic controls, not React Native's memo-wrapped component identity.
  const tabs = routeNames.map(name => tree.root.findByProps({ testID: "tab-" + name.toLowerCase() }));
  expect(tabs).toHaveLength(5);
  tabs.forEach((tab, index) => {
    expect(tab.props.accessibilityRole).toBe("tab");
    expect(tab.props.accessibilityLabel).toBe(routeNames[index]);
    expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(tab.props.style).flexBasis).toBe("33.333333%");
  });
  for (const name of routeNames) {
    const label = tree.root.findByProps({ children: name, allowFontScaling: true });
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.maxFontSizeMultiplier).toBe(2);
  }
});
it("tab navigation emits the preventable event before selecting a destination", async () => {
  const p = props(); const tree = await render(<ResponsiveTabBar {...(p as unknown as BottomTabBarProps)} />);
  await act(async () => tree.root.findByProps({ testID: "tab-shop" }).props.onPress());
  expect(p.navigation.emit).toHaveBeenCalledWith({ type: "tabPress", target: "Shop", canPreventDefault: true });
  expect(p.navigation.navigate).toHaveBeenCalledWith("Shop", undefined);
});
