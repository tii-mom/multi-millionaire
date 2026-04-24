import { Languages } from "lucide-react";
import { useI18n } from "@/src/lib/i18n";

export default function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
      aria-label={t("app.language.aria")}
    >
      <Languages className="ml-2 h-3.5 w-3.5 text-white/45" />
      {(["zh", "en"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={`min-w-8 rounded-full px-2 py-1 text-[10px] font-semibold tracking-widest transition-colors ${
            language === item
              ? "bg-[#DBFF00] text-black"
              : "text-white/45 hover:bg-white/5 hover:text-white/80"
          }`}
        >
          {item === "zh" ? t("app.language.zh") : t("app.language.en")}
        </button>
      ))}
    </div>
  );
}
