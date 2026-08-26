import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // `src/lib/supabase/service.ts` is the service-role client WITHOUT the `import
    // "server-only"` guard — it has to be, because that package throws on import and would
    // kill the `tsx` seeding scripts that need it. Everything under src/ must go through
    // `admin.ts`, which re-exports it behind the guard. Without this rule the safe door and
    // the unguarded one look identical at the import site, and the unguarded one is the
    // shorter name.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/supabase/admin.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/service", "@/lib/supabase/service"],
              message:
                "Import createAdminClient from @/lib/supabase/admin instead. " +
                "service.ts drops the server-only guard for scripts/ and must not be " +
                "reachable from app code.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
