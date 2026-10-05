# HIDI Mobile Premium V2 — design system

## Core colours
- Canvas: `#FFFFFF`
- Raised surface: `#FFFFFF`
- Primary text: `#1C1C1E`
- Secondary text: `#64646A`
- Muted text: `#8E8E93`
- Border: `#ECECEF`
- Accent / primary CTA: `#FF3F6C`
- Accent pressed: `#E73560`
- Discount / positive: `#178B4B`
- Warning: `#B86B00`
- Destructive: `#D92D20`
- Skeleton: `#F2F2F4`

The accent is strategic, not decorative. Most screens remain white, charcoal and image-led.

## Typography
Use platform-native sans serif:
- iOS: SF Pro Display/Text through the system font.
- Android: Roboto through the system font.

Scale:
- Display: 28/34, 700
- Screen title: 22/28, 700
- Section title: 18/24, 700
- Product brand/edit: 13/18, 700
- Product name: 14/20, 400
- Price: 15/20, 700
- Body: 15/22, 400
- Metadata: 12/16, 400
- CTA: 15/20, 700

All text scales with accessibility settings. Product names may use two lines; essential price/size states never rely on truncation.

## Geometry
- Outer gutter: 16dp
- Grid gap: 12dp
- Card radius: 10dp
- Sheet radius: 20dp top corners
- Primary control height: 52dp
- Minimum touch target: 48dp
- Product media: 4:5 default; 1:1 only for approved campaign tiles
- Elevation: subtle 1–3dp equivalent with low-opacity charcoal shadow

## Product card
- No heavy box border.
- Image fills 4:5 frame.
- Wishlist is a 40–48dp floating control.
- Text stack stays compact and left aligned.
- Original price is struck through; discount percentage is green.
- No fake rating, discount or urgency.

## Motion
- Card press: 160–220ms spring, max scale 0.985 on press.
- Wishlist: 280–360ms pop with one haptic event.
- Bottom sheet: spring damping tuned for no bounce-through.
- Swipe remove: reveal destructive action, then require release threshold.
- Respect Reduce Motion and disable decorative parallax.
