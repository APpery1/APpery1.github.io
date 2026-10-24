let loading: Promise<unknown> | undefined;

// Keep custom fonts off the city's initial download path. System fonts render
// the loading screen; local fonts join the document once the city is visible.
export function loadSiteFonts() {
  if (!loading) {
    loading = Promise.allSettled(
      [
        { file: "town-sans.ttf", weight: "400" },
        { file: "town-sans-bold.ttf", weight: "700" },
      ].map(async ({ file, weight }) => {
        const font = new FontFace(
          "Town Sans",
          `url("${import.meta.env.BASE_URL}assets/fonts/${file}") format("truetype")`,
          { weight, display: "swap" },
        );
        document.fonts.add(font);
        await font.load();
      }),
    );
  }
  return loading;
}
