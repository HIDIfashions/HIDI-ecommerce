# React Native and linked libraries provide their own consumer rules.
# Restoration uses a fragment namespace check. Keep fragment names and constructors
# under R8 optimization; do not disable shrinking or all native obfuscation.
-keep class com.swmansion.rnscreens.** extends androidx.fragment.app.Fragment {
    <init>();
}
