// The host app installs vue-i18n's global $t/$d/$n on the shared Vue instance
// at runtime (this mod never imports vue-i18n itself). Pulling in its types
// here activates vue-i18n's ComponentCustomProperties augmentation so
// ExampleSection.vue's `$t` calls typecheck the same way a real mod's would.
import 'vue-i18n'
