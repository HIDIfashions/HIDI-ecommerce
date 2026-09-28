package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class HidiHomeView extends ScrollView {
    interface Navigator {
        void openPath(String path);
    }

    private static final int IVORY = Color.rgb(248, 238, 228);
    private static final int CREAM = Color.rgb(255, 250, 245);
    private static final int MULBERRY = Color.rgb(89, 29, 32);
    private static final int GOLD = Color.rgb(213, 162, 77);
    private static final int INK = Color.rgb(36, 20, 21);
    private static final int MUTED = Color.rgb(112, 91, 86);
    private static final int SOFT_SAGE = Color.rgb(222, 226, 209);

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final LinearLayout root;
    private final LinearLayout featuredRow;
    private final ExecutorService catalogueExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    HidiHomeView(Activity activity, Navigator navigator, RemoteImageLoader images) {
        super(activity);
        this.activity = activity;
        this.navigator = navigator;
        this.images = images;

        setFillViewport(true);
        setClipToPadding(false);
        setBackgroundColor(IVORY);
        setVerticalScrollBarEnabled(false);
        setOverScrollMode(OVER_SCROLL_NEVER);

        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(IVORY);
        addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        addTopBar();
        addHero();
        addDiscoveryIntro();
        addCollectionRail();
        addAnanyaEditorial();
        featuredRow = addFeaturedSection();
        addPrivilege();
        addServicePromise();
        addBrandStatement();

        Space bottomSpace = new Space(activity);
        root.addView(bottomSpace, new LinearLayout.LayoutParams(1, dp(28)));

        animate().alpha(0f).translationY(dp(10)).setDuration(0).withEndAction(() ->
                animate().alpha(1f).translationY(0).setDuration(320L).start()
        ).start();

        loadFeaturedProducts();
    }

    private void addTopBar() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(20), dp(10), dp(12), dp(8));

        LinearLayout wordmarkWrap = new LinearLayout(activity);
        wordmarkWrap.setOrientation(LinearLayout.VERTICAL);
        wordmarkWrap.setGravity(Gravity.CENTER_VERTICAL);

        TextView wordmark = text("HIDI", 27, MULBERRY, Typeface.BOLD);
        wordmark.setLetterSpacing(0.16f);

        TextView strap = text("THE MODERN INDIAN EDIT", 8, MUTED, Typeface.NORMAL);
        strap.setLetterSpacing(0.14f);
        strap.setPadding(1, dp(1), 0, 0);

        wordmarkWrap.addView(wordmark);
        wordmarkWrap.addView(strap);

        bar.addView(wordmarkWrap, new LinearLayout.LayoutParams(0, dp(54), 1f));
        bar.addView(iconButton(R.drawable.ic_search, "Search", () -> navigator.openPath("/search")));
        bar.addView(iconButton(R.drawable.ic_bag, "Bag", () -> navigator.openPath("/cart")));

        root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(72)
        ));
    }

    private void addHero() {
        FrameLayout hero = new FrameLayout(activity);
        hero.setBackgroundColor(SOFT_SAGE);

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, "/brand/hidi-hero-green-garden-fullbody.webp", SOFT_SAGE);
        hero.addView(image, match());

        View shade = new View(activity);
        GradientDrawable gradient = new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{0xD8160C0E, 0x6B160C0E, 0x00160C0E}
        );
        shade.setBackground(gradient);
        hero.addView(shade, match());

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(22), dp(22), dp(22), dp(24));

        TextView season = text("HIDI / NEW SEASON", 11, GOLD, Typeface.BOLD);
        season.setLetterSpacing(0.12f);
        copy.addView(season);

        TextView headline = text("Wear the\nfeeling.", 43, Color.WHITE, Typeface.NORMAL);
        headline.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        headline.setLineSpacing(0f, 0.94f);
        headline.setPadding(0, dp(8), 0, dp(10));
        copy.addView(headline);

        TextView sub = text("Indian wear with a modern point of view — made for workdays, slow days and everything in between.", 14, 0xFFF8EEE4, Typeface.NORMAL);
        sub.setLineSpacing(dp(2), 1.05f);
        sub.setMaxWidth(dp(320));
        copy.addView(sub);

        TextView cta = pill("SHOP NEW ARRIVALS  →", CREAM, MULBERRY);
        LinearLayout.LayoutParams ctaParams = wrap();
        ctaParams.topMargin = dp(18);
        copy.addView(cta, ctaParams);
        cta.setOnClickListener(v -> navigator.openPath("/collections/new-arrivals"));

        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        hero.addView(copy, copyParams);

        TextView index = text("HIDI · 01", 9, 0xCCFFFFFF, Typeface.BOLD);
        index.setLetterSpacing(0.12f);
        FrameLayout.LayoutParams indexParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END
        );
        indexParams.setMargins(0, dp(18), dp(18), 0);
        hero.addView(index, indexParams);

        root.addView(hero, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(590)
        ));
    }

    private void addDiscoveryIntro() {
        LinearLayout section = verticalSection(dp(26), dp(28), dp(24), dp(14));

        TextView eyebrow = eyebrow("YOUR HIDI");
        section.addView(eyebrow);

        TextView title = title("Dress for the day you want.");
        title.setPadding(0, dp(6), 0, dp(7));
        section.addView(title);

        TextView copy = text("A faster way to discover what fits your mood, your calendar and your kind of comfort.", 14, MUTED, Typeface.NORMAL);
        copy.setLineSpacing(dp(2), 1.08f);
        section.addView(copy);

        root.addView(section);
    }

    private void addCollectionRail() {
        LinearLayout heading = sectionHeading("SHOP BY EDIT", "Work. Everyday. Occasion.", null, null);
        root.addView(heading);

        HorizontalScrollView scroll = horizontalRail();
        LinearLayout row = horizontalRow();
        row.setPadding(dp(18), 0, dp(18), 0);

        row.addView(collectionCard(
                "/products/ira-beige-office-kurta-set/01-main.png",
                "THE WORK EDIT",
                "Quiet confidence, all day.",
                "/collections/work-edit"
        ));
        row.addView(collectionCard(
                "/products/myra-peach-comfort-kurta-set/01-main.png",
                "EVERYDAY",
                "Ease, without looking ordinary.",
                "/collections/everyday"
        ));
        row.addView(collectionCard(
                "/products/kiara-wine-festive-kurta-set/01-main.png",
                "OCCASION",
                "Presence, without excess.",
                "/collections/occasion"
        ));

        scroll.addView(row);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(394)
        ));
    }

    private View collectionCard(String imageUrl, String eyebrow, String title, String path) {
        FrameLayout card = roundedFrame(CREAM, 20);
        LinearLayout.LayoutParams outer = new LinearLayout.LayoutParams(dp(264), dp(366));
        outer.setMargins(0, 0, dp(12), 0);
        card.setLayoutParams(outer);

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, imageUrl, SOFT_SAGE);
        card.addView(image, match());

        View shade = new View(activity);
        shade.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{0xD6191110, 0x15191110, 0x00191110}
        ));
        card.addView(shade, match());

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(18), dp(18), dp(18), dp(18));

        TextView e = text(eyebrow, 10, GOLD, Typeface.BOLD);
        e.setLetterSpacing(0.11f);
        copy.addView(e);

        TextView t = text(title, 23, Color.WHITE, Typeface.NORMAL);
        t.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        t.setPadding(0, dp(5), 0, dp(8));
        copy.addView(t);

        TextView discover = text("DISCOVER  →", 10, Color.WHITE, Typeface.BOLD);
        discover.setLetterSpacing(0.08f);
        copy.addView(discover);

        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        card.addView(copy, copyParams);
        card.setOnClickListener(v -> navigator.openPath(path));
        pressEffect(card);
        return card;
    }

    private void addAnanyaEditorial() {
        LinearLayout heading = sectionHeading("ANANYA'S EDIT", "Chosen with a point of view.", null, null);
        heading.setPadding(dp(22), dp(28), dp(22), dp(14));
        root.addView(heading);

        FrameLayout editorial = roundedFrame(MULBERRY, 0);
        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, "/brand/hidi-manifesto-ananya.webp", MULBERRY);
        editorial.addView(image, match());

        View shade = new View(activity);
        shade.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0xB3591D20, 0x19591D20, 0x00591D20}
        ));
        editorial.addView(shade, match());

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(22), dp(22), dp(22), dp(22));

        TextView small = text("THE HIDI POINT OF VIEW", 10, GOLD, Typeface.BOLD);
        small.setLetterSpacing(0.11f);
        copy.addView(small);

        TextView big = text("Modern Indian wear,\nwithout the noise.", 29, Color.WHITE, Typeface.NORMAL);
        big.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        big.setPadding(0, dp(7), 0, dp(12));
        copy.addView(big);

        TextView cta = text("EXPLORE THE EDIT  →", 10, Color.WHITE, Typeface.BOLD);
        cta.setLetterSpacing(0.08f);
        copy.addView(cta);

        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        editorial.addView(copy, copyParams);
        editorial.setOnClickListener(v -> navigator.openPath("/collections/occasion"));

        root.addView(editorial, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(330)
        ));
    }

    private LinearLayout addFeaturedSection() {
        LinearLayout heading = sectionHeading(
                "THE HIDI EDIT",
                "Pieces to live in now.",
                "SHOP ALL  →",
                () -> navigator.openPath("/collections/all")
        );
        heading.setPadding(dp(22), dp(32), dp(22), dp(14));
        root.addView(heading);

        HorizontalScrollView scroll = horizontalRail();
        LinearLayout row = horizontalRow();
        row.setPadding(dp(18), 0, dp(18), 0);

        for (int i = 0; i < 4; i++) row.addView(productSkeleton());

        scroll.addView(row);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(372)
        ));

        return row;
    }

    private void addPrivilege() {
        LinearLayout section = verticalSection(dp(22), dp(32), dp(22), dp(30));

        TextView e = eyebrow("HIDI PRIVILEGES");
        e.setTextColor(GOLD);
        section.addView(e);

        TextView title = text("A little more,\nwhen you shop HIDI.", 31, Color.WHITE, Typeface.NORMAL);
        title.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        title.setPadding(0, dp(6), 0, dp(18));
        section.addView(title);

        section.addView(privilegeLine("01", "₹1 HIDI Privilege", "Spend ₹3,999+ and unlock one eligible style for ₹1."));
        section.addView(divider(0x35FFFFFF));
        section.addView(privilegeLine("02", "A Little Silver", "A launch keepsake on qualifying orders, while allocation lasts."));
        section.addView(divider(0x35FFFFFF));
        section.addView(privilegeLine("03", "HIDI Rewards", "Earn rewards when you shop and use them toward a future order."));

        TextView cta = pill("EXPLORE HIDI  →", GOLD, MULBERRY);
        LinearLayout.LayoutParams ctaParams = wrap();
        ctaParams.topMargin = dp(22);
        section.addView(cta, ctaParams);
        cta.setOnClickListener(v -> navigator.openPath("/collections/all"));

        section.setBackgroundColor(MULBERRY);
        root.addView(section);
    }

    private View privilegeLine(String index, String title, String copy) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(14), 0, dp(14));

        TextView number = text(index, 11, GOLD, Typeface.BOLD);
        number.setLetterSpacing(0.08f);
        row.addView(number, new LinearLayout.LayoutParams(dp(42), ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout body = new LinearLayout(activity);
        body.setOrientation(LinearLayout.VERTICAL);
        body.addView(text(title, 16, Color.WHITE, Typeface.BOLD));

        TextView detail = text(copy, 12, 0xFFE9DDD5, Typeface.NORMAL);
        detail.setLineSpacing(dp(1), 1.04f);
        detail.setPadding(0, dp(4), 0, 0);
        body.addView(detail);

        row.addView(body, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private void addServicePromise() {
        LinearLayout section = verticalSection(dp(22), dp(26), dp(22), dp(26));
        section.addView(eyebrow("SHOP WITH CONFIDENCE"));

        LinearLayout grid = new LinearLayout(activity);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(0, dp(8), 0, 0);
        grid.addView(serviceRow("COMPLIMENTARY SHIPPING", "On orders of ₹1,499 and above."));
        grid.addView(serviceRow("EASY EXCHANGE", "Simple exchange within 7 days."));
        grid.addView(serviceRow("SECURE CHECKOUT", "Protected payment experience."));

        section.addView(grid);
        root.addView(section);
    }

    private View serviceRow(String title, String copy) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(12), 0, dp(12));

        View dot = new View(activity);
        dot.setBackground(roundRect(GOLD, 99, GOLD, 0));
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(8), dp(8));
        dotParams.rightMargin = dp(14);
        row.addView(dot, dotParams);

        LinearLayout body = new LinearLayout(activity);
        body.setOrientation(LinearLayout.VERTICAL);

        TextView t = text(title, 11, INK, Typeface.BOLD);
        t.setLetterSpacing(0.06f);
        body.addView(t);
        TextView d = text(copy, 12, MUTED, Typeface.NORMAL);
        d.setPadding(0, dp(2), 0, 0);
        body.addView(d);

        row.addView(body);
        return row;
    }

    private void addBrandStatement() {
        LinearLayout section = verticalSection(dp(22), dp(30), dp(22), dp(30));
        section.setBackgroundColor(CREAM);

        TextView e = eyebrow("THE HIDI PROMISE");
        section.addView(e);

        TextView title = text("Style that feels\nas good as it looks.", 32, MULBERRY, Typeface.NORMAL);
        title.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        title.setPadding(0, dp(6), 0, dp(10));
        section.addView(title);

        TextView copy = text("Thoughtful silhouettes, comfortable fabrics and an experience designed to make choosing easier.", 14, MUTED, Typeface.NORMAL);
        copy.setLineSpacing(dp(2), 1.06f);
        section.addView(copy);

        TextView about = text("ABOUT HIDI  →", 10, MULBERRY, Typeface.BOLD);
        about.setLetterSpacing(0.08f);
        about.setPadding(0, dp(18), 0, 0);
        about.setOnClickListener(v -> navigator.openPath("/about"));
        section.addView(about);

        root.addView(section);
    }

    private void loadFeaturedProducts() {
        catalogueExecutor.execute(() -> {
            List<Product> products = fetchProducts();
            if (products.isEmpty()) return;
            mainHandler.post(() -> renderFeatured(products));
        });
    }

    private List<Product> fetchProducts() {
        List<Product> products = new ArrayList<>();
        HttpURLConnection connection = null;
        try {
            String endpoint = BuildConfig.HIDI_API_URL + "/products/featured?limit=6";
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "HIDIAndroid/1.1");

            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return products;

            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }

            JSONArray array = new JSONArray(body.toString());
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                String slug = item.optString("slug", "");
                String name = item.optString("name", "HIDI");
                int price = item.optInt("minPricePaise", 0);

                String image = "";
                JSONArray imageArray = item.optJSONArray("images");
                if (imageArray != null && imageArray.length() > 0) {
                    image = imageArray.getJSONObject(0).optString("url", "");
                }

                if (!slug.isEmpty() && !image.isEmpty()) {
                    products.add(new Product(slug, name, price, image));
                }
            }
        } catch (Exception ignored) {
            // The static discovery experience remains useful if catalogue API is temporarily unavailable.
        } finally {
            if (connection != null) connection.disconnect();
        }
        return products;
    }

    private void renderFeatured(List<Product> products) {
        featuredRow.removeAllViews();
        int count = Math.min(products.size(), 6);
        for (int i = 0; i < count; i++) featuredRow.addView(productCard(products.get(i)));
    }

    private View productCard(Product product) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(IVORY);

        LinearLayout.LayoutParams outer = new LinearLayout.LayoutParams(dp(180), dp(350));
        outer.setMargins(0, 0, dp(12), 0);
        card.setLayoutParams(outer);

        FrameLayout imageFrame = roundedFrame(SOFT_SAGE, 14);
        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, product.image, SOFT_SAGE);
        imageFrame.addView(image, match());

        TextView newTag = text("NEW", 9, MULBERRY, Typeface.BOLD);
        newTag.setLetterSpacing(0.08f);
        newTag.setGravity(Gravity.CENTER);
        newTag.setBackground(roundRect(CREAM, 99, CREAM, 0));
        FrameLayout.LayoutParams tagParams = new FrameLayout.LayoutParams(dp(48), dp(27), Gravity.TOP | Gravity.START);
        tagParams.setMargins(dp(10), dp(10), 0, 0);
        imageFrame.addView(newTag, tagParams);

        card.addView(imageFrame, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(256)
        ));

        TextView name = text(product.name, 13, INK, Typeface.NORMAL);
        name.setMaxLines(1);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setPadding(dp(2), dp(10), dp(2), 0);
        card.addView(name);

        TextView price = text(formatPrice(product.pricePaise), 13, MULBERRY, Typeface.BOLD);
        price.setPadding(dp(2), dp(4), dp(2), 0);
        card.addView(price);

        card.setOnClickListener(v -> navigator.openPath("/products/" + product.slug));
        pressEffect(card);
        return card;
    }

    private View productSkeleton() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);

        LinearLayout.LayoutParams outer = new LinearLayout.LayoutParams(dp(180), dp(350));
        outer.setMargins(0, 0, dp(12), 0);
        card.setLayoutParams(outer);

        View image = new View(activity);
        image.setBackground(roundRect(SOFT_SAGE, 14, SOFT_SAGE, 0));
        card.addView(image, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(256)
        ));

        View line1 = new View(activity);
        line1.setBackgroundColor(0x22A18D83);
        LinearLayout.LayoutParams line1Params = new LinearLayout.LayoutParams(dp(142), dp(11));
        line1Params.setMargins(0, dp(12), 0, 0);
        card.addView(line1, line1Params);

        View line2 = new View(activity);
        line2.setBackgroundColor(0x22A18D83);
        LinearLayout.LayoutParams line2Params = new LinearLayout.LayoutParams(dp(72), dp(11));
        line2Params.setMargins(0, dp(8), 0, 0);
        card.addView(line2, line2Params);

        return card;
    }

    private LinearLayout sectionHeading(String eyebrow, String title, String action, Runnable onAction) {
        LinearLayout container = new LinearLayout(activity);
        container.setOrientation(LinearLayout.HORIZONTAL);
        container.setGravity(Gravity.BOTTOM);
        container.setPadding(dp(22), dp(18), dp(18), dp(14));

        LinearLayout left = new LinearLayout(activity);
        left.setOrientation(LinearLayout.VERTICAL);
        left.addView(eyebrow(eyebrow));
        TextView heading = title(title);
        heading.setPadding(0, dp(4), 0, 0);
        left.addView(heading);
        container.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        if (action != null) {
            TextView actionView = text(action, 10, MULBERRY, Typeface.BOLD);
            actionView.setLetterSpacing(0.06f);
            actionView.setGravity(Gravity.END);
            actionView.setPadding(dp(8), dp(12), 0, dp(2));
            actionView.setOnClickListener(v -> onAction.run());
            container.addView(actionView);
        }

        return container;
    }

    private LinearLayout verticalSection(int left, int top, int right, int bottom) {
        LinearLayout section = new LinearLayout(activity);
        section.setOrientation(LinearLayout.VERTICAL);
        section.setPadding(left, top, right, bottom);
        return section;
    }

    private HorizontalScrollView horizontalRail() {
        HorizontalScrollView scroll = new HorizontalScrollView(activity);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        return scroll;
    }

    private LinearLayout horizontalRow() {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.TOP);
        return row;
    }

    private TextView eyebrow(String value) {
        TextView view = text(value, 10, GOLD, Typeface.BOLD);
        view.setLetterSpacing(0.11f);
        return view;
    }

    private TextView title(String value) {
        TextView view = text(value, 27, MULBERRY, Typeface.NORMAL);
        view.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        return view;
    }

    private TextView text(String value, int sizeSp, int color, int style) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans", style));
        view.setIncludeFontPadding(false);
        return view;
    }

    private TextView pill(String value, int background, int foreground) {
        TextView view = text(value, 10, foreground, Typeface.BOLD);
        view.setLetterSpacing(0.07f);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(18), dp(12), dp(18), dp(12));
        view.setBackground(roundRect(background, 99, background, 0));
        pressEffect(view);
        return view;
    }

    private ImageButton iconButton(int resId, String description, Runnable action) {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(resId);
        button.setColorFilter(MULBERRY);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setContentDescription(description);
        button.setPadding(dp(12), dp(12), dp(12), dp(12));
        button.setOnClickListener(v -> action.run());
        pressEffect(button);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(48), dp(48));
        button.setLayoutParams(params);
        return button;
    }

    private FrameLayout roundedFrame(int color, int radiusDp) {
        FrameLayout frame = new FrameLayout(activity);
        frame.setClipToOutline(radiusDp > 0);
        frame.setBackground(roundRect(color, radiusDp, color, 0));
        return frame;
    }

    private GradientDrawable roundRect(int fill, int radiusDp, int stroke, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) drawable.setStroke(dp(strokeDp), stroke);
        return drawable;
    }

    private View divider(int color) {
        View divider = new View(activity);
        divider.setBackgroundColor(color);
        divider.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(1)
        ));
        return divider;
    }

    private void pressEffect(View view) {
        view.setClickable(true);
        view.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    v.animate().scaleX(0.985f).scaleY(0.985f).setDuration(80L).start();
                    break;
                case android.view.MotionEvent.ACTION_CANCEL:
                case android.view.MotionEvent.ACTION_UP:
                    v.animate().scaleX(1f).scaleY(1f).setDuration(110L).start();
                    break;
                default:
                    break;
            }
            return false;
        });
    }

    private String formatPrice(int paise) {
        if (paise <= 0) return "";
        NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("en", "IN"));
        format.setMaximumFractionDigits(0);
        return format.format(paise / 100.0);
    }

    private FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    void dispose() {
        catalogueExecutor.shutdownNow();
    }

    private static final class Product {
        final String slug;
        final String name;
        final int pricePaise;
        final String image;

        Product(String slug, String name, int pricePaise, String image) {
            this.slug = slug;
            this.name = name;
            this.pricePaise = pricePaise;
            this.image = image;
        }
    }
}
