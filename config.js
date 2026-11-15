window.APP_CONFIG = {
  // Брендинг
  brandName: "MindCore project",
  accentColor: "#8B5CF6",
  backgroundColor: "#0E1B2B",
  cardColor: "#12243a",

  // Курс
  courseId: "course_sushka",

// Supabase
  supabaseUrl: "https://kellbigftdbjpcpkznir.supabase.co",
  supabaseAnonKey: "sb_publishable_RnQeGG-sDCGzudYrgjT1CQ_df_9CYdy"
};

window.APP_THEME_PRESETS = [
  { id: "dark_premium", name: "Dark Premium", description: "Тёмно-синий фон с фиолетовым акцентом" },
  { id: "light_clean", name: "Light Clean", description: "Светлый минимализм" },
  { id: "fitness_power", name: "Fitness Power", description: "Тёмный зелёный фитнес-стиль" },
  { id: "soft_women", name: "Soft Women", description: "Светлый нюд/розовый стиль" },
  { id: "business_black", name: "Business Black", description: "Графит/чёрный/золото" },
  { id: "wow_glass", name: "Wow Glass", description: "Премиальный glass-стиль с живым свечением" },
  {
    id: "matcha_aesthetic",
    title: "Matcha Aesthetic",
    name: "Matcha Aesthetic",
    description: "Нежный розово-зелёный стиль с акцентом матча",
    className: "theme-matcha-aesthetic",
    previewTokens: {
      bg: "#FFFDF8",
      card: "#FFFFFF",
      card2: "#FFF4F7",
      text: "#332522",
      muted: "#8C6F66",
      accent: "#FF5F93",
      accent2: "#9FD267",
      border: "rgba(255, 95, 147, 0.22)"
    }
  },
  {
    id: "emerald_gold",
    title: "Emerald Gold",
    name: "Emerald Gold",
    description: "Глубокий изумрудный стиль с золотым премиум-акцентом",
    className: "theme-emerald-gold",
    badge: "Premium",
    previewTokens: {
      bg: "#033F47",
      card: "rgba(3, 67, 74, 0.84)",
      card2: "rgba(5, 86, 92, 0.76)",
      text: "#F8F1D9",
      muted: "#B8C7B0",
      accent: "#D4A017",
      accent2: "#0FA3B1",
      border: "rgba(212, 160, 23, 0.28)"
    }
  },
  {
    id: "minimal-beige",
    title: "Minimal Beige",
    name: "Minimal Beige",
    description: "Светлый минималистичный кабинет в тёплой бежевой палитре",
    className: "theme-minimal-beige",
    previewTokens: {
      bg: "#FAF8F6",
      card: "#FFFFFF",
      card2: "#F1ECE8",
      text: "#211A17",
      muted: "#786A62",
      accent: "#1A100C",
      accent2: "#CDBAAE",
      border: "#E4DEDA"
    }
  }
];

window.APP_COURSE_FORM_OVERRIDES = {
  "course_1781255103582": {
    "94739b9b-fa30-4feb-83f2-6170ea460a9c": {
      title: "BAŞLANGIÇ NOKTANIZ | A NOKTASI",
      description: "",
      intro_blocks: [
        { text: "Eğitime başlamadan önce kendiniz için küçük bir başlangıç kaydı oluşturun. 🌿" },
        { text: "Bugün bu eğitime hangi noktadan başlıyorsunuz?", bold: true },
        { text: "Örneğin: Karın bölgesindeki gevşeklik, şişkinlik, nefes kontrolünde zorlanma, bedeninizle ilgili güvensizlik veya ulaşmak istediğiniz sonuçlar…" },
        { text: "Başlangıç olarak kendiniz için:" },
        { items: [
          "Kilonuzu ve vücut ölçülerinizi kaydedin.",
          "Fotoğrafınızı çekin.",
          "Mevcut durumunuzu ve beklentilerinizi birkaç cümleyle yazın."
        ] },
        { text: "📌 Bu kayıt tamamen size özeldir. Kimseyle paylaşmanız gerekmez." },
        { text: "Eğitimin sonunda A noktanıza geri dönün ve nelerin değiştiğini kendiniz görün." },
        { text: "Unutmayın, gelişiminizi görebilmek için önce nereden başladığınızı bilmelisiniz.", bold: true, suffix: " ✨" }
      ],
      form_schema: {
        questions: [{
          id: "problems",
          type: "multiple_choice",
          title: "Bugün bu eğitime hangi noktadan başlıyorsunuz?",
          required: true,
          options: [],
          allow_other: true,
          text_only: true,
          label_hidden: true,
          other_placeholder: "Mevcut durumunuzu ve beklentilerinizi yazın…"
        }]
      },
      settings: { result_title: "BAŞLANGIÇ NOKTANIZ | A NOKTASI" }
    }
  }
};
