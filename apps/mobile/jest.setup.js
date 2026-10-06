require("react-native-gesture-handler/jestSetup");
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-keychain", () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));
