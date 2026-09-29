import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Linking } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useHidiTheme } from "../theme/HidiTheme";
import type { RootStackParamList } from "./types";
import MainTabs from "./MainTabs";
import LaunchRestoreScreen from "../screens/identity/LaunchRestoreScreen";
import WelcomeScreen from "../screens/identity/WelcomeScreen";
import StylePreferencesScreen from "../screens/identity/StylePreferencesScreen";
import SignInScreen from "../screens/identity/SignInScreen";
import VerifyPhoneScreen from "../screens/identity/VerifyPhoneScreen";
import CompleteProfileScreen from "../screens/identity/CompleteProfileScreen";
import ConsentPreferencesScreen from "../screens/identity/ConsentPreferencesScreen";
import VerificationLimitedScreen from "../screens/identity/VerificationLimitedScreen";
import CollectionLandingScreen from "../screens/discover/CollectionLandingScreen";
import ListingScreen from "../screens/discover/ListingScreen";
import SearchScreen from "../screens/discover/SearchScreen";
import SearchResultsScreen from "../screens/discover/SearchResultsScreen";
import RecentlyViewedScreen from "../screens/discover/RecentlyViewedScreen";
import ProductDetailScreen from "../screens/product/ProductDetailScreen";
import ProductGalleryScreen from "../screens/product/ProductGalleryScreen";
import VariantPickerScreen from "../screens/product/VariantPickerScreen";
import SizeGuideScreen from "../screens/product/SizeGuideScreen";
import FitHelperScreen from "../screens/product/FitHelperScreen";
import DetailsCareScreen from "../screens/product/DetailsCareScreen";
import DeliveryCheckScreen from "../screens/product/DeliveryCheckScreen";
import ReviewsScreen from "../screens/product/ReviewsScreen";
import ReviewDetailScreen from "../screens/product/ReviewDetailScreen";
import StockAlertScreen from "../screens/product/StockAlertScreen";
import ProductUnavailableScreen from "../screens/product/ProductUnavailableScreen";
import SimilarStylesScreen from "../screens/product/SimilarStylesScreen";
import AddedToBagScreen from "../screens/product/AddedToBagScreen";
import BagEditScreen from "../screens/bag/BagEditScreen";
import BagRemoveScreen from "../screens/bag/BagRemoveScreen";
import PromotionsScreen from "../screens/bag/PromotionsScreen";
import PromoFailureScreen from "../screens/bag/PromoFailureScreen";
import BagAttentionScreen from "../screens/bag/BagAttentionScreen";
import SavedForLaterScreen from "../screens/bag/SavedForLaterScreen";
import GuestCheckoutContactScreen from "../screens/checkout/GuestCheckoutContactScreen";
import CheckoutAddressScreen from "../screens/checkout/CheckoutAddressScreen";
import AddAddressScreen from "../screens/checkout/AddAddressScreen";
import AddressErrorsScreen from "../screens/checkout/AddressErrorsScreen";
import AddressUnavailableScreen from "../screens/checkout/AddressUnavailableScreen";
import DeliveryOptionsScreen from "../screens/checkout/DeliveryOptionsScreen";
import ReviewOrderScreen from "../screens/checkout/ReviewOrderScreen";
import PaymentMethodsScreen from "../screens/checkout/PaymentMethodsScreen";
import { SecureCardCheckoutScreen, UpiHandoffScreen } from "../screens/checkout/PaymentHandoffScreens";
import CashOnDeliveryScreen from "../screens/checkout/CashOnDeliveryScreen";
import ConfirmingPaymentScreen from "../screens/checkout/ConfirmingPaymentScreen";
import PaymentPendingScreen from "../screens/checkout/PaymentPendingScreen";
import PaymentFailedScreen from "../screens/checkout/PaymentFailedScreen";
import OrderConfirmedScreen from "../screens/checkout/OrderConfirmedScreen";
import ResumeCheckoutScreen from "../screens/checkout/ResumeCheckoutScreen";
import {
  CancelOrderItemsScreen,
  CancellationResultScreen,
  CodRefundDestinationScreen,
  DeliveredOrderScreen,
  DeliveryAttemptFailedScreen,
  ExchangePriceDifferenceScreen,
  ExchangeReviewScreen,
  ExchangeSizeScreen,
  InvoiceReceiptScreen,
  MyOrdersScreen,
  OrderDetailScreen,
  RefundCompletedScreen,
  RefundInProgressScreen,
  RefundNeedsAttentionScreen,
  ReturnEvidenceScreen,
  ReturnPickupMissedScreen,
  ReturnPickupScreen,
  ReturnReasonScreen,
  ReturnTrackingScreen,
  ReturnUnavailableScreen,
  ReviewReturnScreen,
  SelectReturnItemsScreen,
  SplitShipmentsScreen,
  TrackShipmentScreen,
  WriteReviewScreen,
} from "../screens/orders/OrderScreens";
import { parseHidiDeepLink } from "./deepLinks";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { mode, colors } = useHidiTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const base = mode === "dark" ? DarkTheme : DefaultTheme;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const target = parseHidiDeepLink(url);
      if (!target || !navigationRef.isReady()) return;
      if (target.type === "product") navigationRef.navigate("ProductDeferred", { slug: target.slug });
      else navigationRef.navigate("Collection", { slug: target.slug, title: target.title });
    });
    return () => subscription.remove();
  }, [navigationRef]);

  const navigationTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.action, background: colors.canvas, card: colors.surface, text: colors.ink, border: colors.border, notification: colors.error },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator initialRouteName="Launch" screenOptions={{ headerShown: false, animation: reduceMotion ? "fade" : "slide_from_right", contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="Launch" component={LaunchRestoreScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="StylePreferences" component={StylePreferencesScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="VerifyPhone" component={VerifyPhoneScreen} />
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
        <Stack.Screen name="ConsentPreferences" component={ConsentPreferencesScreen} />
        <Stack.Screen name="VerificationLimited" component={VerificationLimitedScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: "fade" }} />
        <Stack.Screen name="Collection" component={CollectionLandingScreen} />
        <Stack.Screen name="Listing" component={ListingScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen name="RecentlyViewed" component={RecentlyViewedScreen} />
        <Stack.Screen name="ProductDeferred" component={ProductDetailScreen} />
        <Stack.Screen name="ProductGallery" component={ProductGalleryScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="VariantPicker" component={VariantPickerScreen} />
        <Stack.Screen name="SizeGuide" component={SizeGuideScreen} />
        <Stack.Screen name="FitHelper" component={FitHelperScreen} />
        <Stack.Screen name="DetailsCare" component={DetailsCareScreen} />
        <Stack.Screen name="DeliveryCheck" component={DeliveryCheckScreen} />
        <Stack.Screen name="Reviews" component={ReviewsScreen} />
        <Stack.Screen name="ReviewDetail" component={ReviewDetailScreen} />
        <Stack.Screen name="StockAlert" component={StockAlertScreen} />
        <Stack.Screen name="ProductUnavailable" component={ProductUnavailableScreen} />
        <Stack.Screen name="SimilarStyles" component={SimilarStylesScreen} />
        <Stack.Screen name="AddedToBag" component={AddedToBagScreen} options={{ animation: reduceMotion ? "fade" : "slide_from_bottom" }} />
        <Stack.Screen name="BagEdit" component={BagEditScreen} options={{ animation: reduceMotion ? "fade" : "slide_from_bottom" }} />
        <Stack.Screen name="BagRemove" component={BagRemoveScreen} options={{ animation: reduceMotion ? "fade" : "slide_from_bottom" }} />
        <Stack.Screen name="Promotions" component={PromotionsScreen} />
        <Stack.Screen name="PromoFailure" component={PromoFailureScreen} />
        <Stack.Screen name="BagAttention" component={BagAttentionScreen} />
        <Stack.Screen name="SavedForLater" component={SavedForLaterScreen} />
        <Stack.Screen name="CheckoutContact" component={GuestCheckoutContactScreen} />
        <Stack.Screen name="CheckoutAddress" component={CheckoutAddressScreen} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} />
        <Stack.Screen name="AddressErrors" component={AddressErrorsScreen} />
        <Stack.Screen name="AddressUnavailable" component={AddressUnavailableScreen} />
        <Stack.Screen name="DeliveryOptions" component={DeliveryOptionsScreen} />
        <Stack.Screen name="ReviewOrder" component={ReviewOrderScreen} />
        <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
        <Stack.Screen name="UpiHandoff" component={UpiHandoffScreen} />
        <Stack.Screen name="SecureCardCheckout" component={SecureCardCheckoutScreen} />
        <Stack.Screen name="CashOnDelivery" component={CashOnDeliveryScreen} />
        <Stack.Screen name="ConfirmingPayment" component={ConfirmingPaymentScreen} />
        <Stack.Screen name="PaymentPending" component={PaymentPendingScreen} />
        <Stack.Screen name="PaymentFailed" component={PaymentFailedScreen} />
        <Stack.Screen name="OrderConfirmed" component={OrderConfirmedScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="ResumeCheckout" component={ResumeCheckoutScreen} />
        <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="TrackShipment" component={TrackShipmentScreen} />
        <Stack.Screen name="SplitShipments" component={SplitShipmentsScreen} />
        <Stack.Screen name="DeliveryAttemptFailed" component={DeliveryAttemptFailedScreen} />
        <Stack.Screen name="CancelOrderItems" component={CancelOrderItemsScreen} />
        <Stack.Screen name="CancellationResult" component={CancellationResultScreen} />
        <Stack.Screen name="InvoiceReceipt" component={InvoiceReceiptScreen} />
        <Stack.Screen name="DeliveredOrder" component={DeliveredOrderScreen} />
        <Stack.Screen name="SelectReturnItems" component={SelectReturnItemsScreen} />
        <Stack.Screen name="ReturnReason" component={ReturnReasonScreen} />
        <Stack.Screen name="ReturnEvidence" component={ReturnEvidenceScreen} />
        <Stack.Screen name="ReturnPickup" component={ReturnPickupScreen} />
        <Stack.Screen name="ReviewReturn" component={ReviewReturnScreen} />
        <Stack.Screen name="ReturnTracking" component={ReturnTrackingScreen} />
        <Stack.Screen name="RefundInProgress" component={RefundInProgressScreen} />
        <Stack.Screen name="RefundCompleted" component={RefundCompletedScreen} />
        <Stack.Screen name="ExchangeSize" component={ExchangeSizeScreen} />
        <Stack.Screen name="ExchangeReview" component={ExchangeReviewScreen} />
        <Stack.Screen name="ReturnUnavailable" component={ReturnUnavailableScreen} />
        <Stack.Screen name="WriteReview" component={WriteReviewScreen} />
        <Stack.Screen name="CodRefundDestination" component={CodRefundDestinationScreen} />
        <Stack.Screen name="ReturnPickupMissed" component={ReturnPickupMissedScreen} />
        <Stack.Screen name="ExchangePriceDifference" component={ExchangePriceDifferenceScreen} />
        <Stack.Screen name="RefundNeedsAttention" component={RefundNeedsAttentionScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
