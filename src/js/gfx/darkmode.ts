import { loadPreferences, updatePreferences } from "../persist";

// Check system preference for dark mode
export async function setupColorScheme() {
    // Try to load user preferences first
    const prefs = await loadPreferences();

    if (prefs && typeof prefs.darkMode !== "undefined") {
        // Use saved preference if available
        if (prefs.darkMode) {
            document.body.classList.add("dark-mode");
        } else {
            document.body.classList.remove("dark-mode");
        }
    } else {
        // Fall back to system preference if no saved preference
        const prefersDarkMode =
            window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDarkMode) {
            document.body.classList.add("dark-mode");
        }

        // Create initial preferences object
        await updatePreferences({
            darkMode: prefersDarkMode,
        });
    }

    // Listen for system changes to color scheme
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
        "change",
        async (event) => {
            // Only update based on system if user hasn't manually set preference
            const currentPrefs = await loadPreferences();
            if (!currentPrefs || currentPrefs.darkMode === undefined) {
                if (event.matches) {
                    document.body.classList.add("dark-mode");
                } else {
                    document.body.classList.remove("dark-mode");
                }

                // Save the new system preference
                await updatePreferences({
                    darkMode: event.matches,
                });
            }
        },
    );
}

export function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle("dark-mode");
    console.log(`Dark mode ${isDarkMode ? "enabled" : "disabled"}`);

    updatePreferences({
        darkMode: isDarkMode,
    });
}
