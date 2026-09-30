import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
const mockRefresh = jest.fn(async () => undefined);
jest.mock("../src/data/CatalogContext", () => ({ useCatalog: () => ({ state: { kind: "content", data: [], freshness: "fresh", refreshing: false }, refresh: mockRefresh }) }));
jest.mock("../src/components/ProductGrid", () => ({ ProductGrid: () => null }));
jest.mock("../src/components/HidiScreen", () => ({ HidiScreen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../src/storage/systemStorage", () => ({ systemStorage: { dismissOptionalUpdate: jest.fn(async () => undefined) } }));
jest.mock("../src/theme/HidiTheme", () => ({ useHidiTheme: () => ({ mode: "light", preference: "system", colors: require("../src/theme/tokens").hidiColors.light, setPreference: jest.fn(async () => undefined) }) }));
jest.mock("lucide-react-native", () => ({ ArrowLeft: "BackIcon", CircleHelp: "HelpIcon", CloudOff: "OfflineIcon", RefreshCw: "RefreshIcon", SearchX: "SearchIcon" }));
import { GenericErrorScreen, OfflineEmptyScreen, RequiredUpdateScreen, ShopTheLookScreen } from "../src/screens/system/SystemStateScreens";
import { HidiButton } from "../src/components/HidiButton";
import { updateGate } from "../src/models/system";
const trees: ReactTestRenderer[] = [];
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
async function render(node: React.ReactElement) { let tree!: ReactTestRenderer; await act(async () => { tree = renderer.create(node); }); trees.push(tree); return tree; }
afterEach(async () => { await act(async () => { trees.splice(0).forEach(tree => tree.unmount()); }); jest.clearAllMocks(); });
it("H107 has a real safe recovery action, not a fabricated request ID or payment retry", async () => {
  const tree = await render(<GenericErrorScreen navigation={navigation as never} route={{ params: undefined } as never} />);
  expect(JSON.stringify(tree.toJSON())).not.toContain("req-local-demo");
  await act(async () => tree.root.findByType(HidiButton).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Home" }); expect(mockRefresh).not.toHaveBeenCalled();
});
it("H106 retries a real read-only catalogue request", async () => {
  const tree = await render(<OfflineEmptyScreen navigation={navigation as never} route={{} as never} />);
  await act(async () => { tree.root.findByType(HidiButton).props.onPress(); await Promise.resolve(); });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});
it("H110 does not invent minimum versions or navigate an untrusted update URL", async () => {
  const tree = await render(<RequiredUpdateScreen navigation={navigation as never} route={{ params: { url: "javascript:bad", minimumVersion: "999.0.0" } } as never} />);
  expect(JSON.stringify(tree.toJSON())).toContain("no approved remote minimum-version");
  await act(async () => tree.root.findByType(HidiButton).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Home" });
});
it("H118 cannot publish synthetic look components, stock or prices as live merchandise", async () => {
  const tree = await render(<ShopTheLookScreen navigation={navigation as never} route={{} as never} />);
  const output = JSON.stringify(tree.toJSON()); expect(output).toContain("No published look"); expect(output).not.toContain("sage-kurta"); expect(output).not.toContain("169900");
});
it("version gating compares stable numeric components rather than lexical text", () => {
  expect(updateGate({ installedVersion: "1.10.0", minimumVersion: "1.2.0", trustedConfig: true }).required).toBe(false);
  expect(updateGate({ installedVersion: "1.9.0", minimumVersion: "1.10.0", trustedConfig: true }).required).toBe(true);
  expect(updateGate({ installedVersion: "not-a-version", minimumVersion: "1.0.0", trustedConfig: true }).required).toBe(false);
});
