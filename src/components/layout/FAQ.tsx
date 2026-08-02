import { ChevronDown } from "lucide-react";

/**
 * "How it works" + FAQ: server component, zero client JS. The collapsible
 * items use native <details>/<summary> (built-in keyboard and
 * screen-reader support, no JavaScript needed), keeping this section free
 * so it doesn't grow the studio's First Load JS at all.
 *
 * The FAQPage JSON-LD below must stay in sync with the visible questions
 * and answers; mismatched structured data can get a site's rich results
 * disabled.
 */

const HOW_IT_WORKS = [
  {
    title: "Add & format text",
    body: "Click the canvas to add a text block, or click an existing one to select it, then click again to edit. A floating toolbar lets you bold, italicize, underline, strike through, or uppercase your text, plus set alignment, letter-spacing, and line height, all per block. Drag blocks into place; they snap to center with a guide line. Direction (RTL or LTR) is detected automatically.",
  },
  {
    title: "Tune the engraving",
    body: "Adjust depth, shadow, highlight, blur, and paper texture, or apply a one-click preset for depth, paper, and text colour together.",
  },
  {
    title: "Pick a font, paper & signature",
    body: "Choose from fourteen fonts spanning Urdu, Arabic, Latin, and Devanagari, a paper tone, and canvas shape. Add a small watermark too, like your handle, in the Branding field; it debosses to match your text automatically and can be dragged anywhere.",
  },
  {
    title: "Export & share",
    body: "Download a high-resolution PNG, copy it straight to your clipboard, or share it to Instagram and other apps on mobile. Love a look? Save it as a set, or request to have it featured in the gallery.",
  },
];

const FAQ_ITEMS = [
  {
    question: 'What is a "debossed" or letterpress text effect?',
    answer:
      "Debossing presses text into a surface rather than printing on top of it, like a blind letterpress impression. Text Deboss Studio recreates that look on-screen with layered light and shadow, so the text reads as pressed into the paper instead of sitting on it.",
  },
  {
    question: "Is my text uploaded to a server?",
    answer:
      "No. Everything runs entirely in your browser: the canvas rendering, the export, even the sets you save. Nothing you type is ever sent anywhere.",
  },
  {
    question: "Can I export a transparent PNG?",
    answer:
      'Yes. Toggle "Transparent background" before downloading or copying, and the paper is left out of the export so you can drop the debossed text onto any background.',
  },
  {
    question: "Which languages and fonts are supported?",
    answer:
      "Any script works. Fourteen fonts are included: Noto Nastaliq Urdu, Jameel Noori Nastaleeq (plus its Kasheeda variant), Gulzar, and Mirza for Nastaliq-style Urdu; Amiri, Noto Naskh Arabic, Reem Kufi, Reem Kufi Fun, Aref Ruqaa, Lateef, and Rakkas for Arabic in a range of styles; plus Playfair Display and Noto Serif Devanagari for Latin and Hindi text.",
  },
  {
    question: "Can I save my own style and reuse it later?",
    answer:
      'Yes. Save any combination of font, paper, tint, and engraving settings as a named "set," and optionally star one as your default so it applies automatically the next time you open the studio.',
  },
  {
    question: "Can I format text with bold, italic, underline, and more?",
    answer:
      "Yes. Click a text block to select it, and a floating toolbar appears with bold, italic, underline, strikethrough, and uppercase toggles, plus alignment, letter-spacing, and line-height controls, all applied per block so different lines can look completely different.",
  },
  {
    question: "Can I add a watermark or signature, like my Instagram handle?",
    answer:
      "Yes. Type anything into the Branding field and it appears as a small watermark, fully debossed to match the rest of your design. It automatically tracks your main text's font at a proportionally smaller size, or you can give it its own font and size. Drag it anywhere on the canvas.",
  },
  {
    question: "Can I get my design featured in the public gallery?",
    answer:
      'Yes. Save a look as a "set," then use "Request to post" from that set or the Create button in the navbar. After a quick one-time-code email verification, your submission is reviewed, and if it\'s a good fit, it gets added to the gallery.',
  },
  {
    question: "Does Text Deboss Studio work well on mobile?",
    answer:
      "Yes. The entire studio, including the text-formatting toolbar, is fully touch-friendly and adapts to small screens, docking the toolbar at the bottom of the screen for easy one-handed reach.",
  },
  {
    question: "Is Text Deboss Studio free to use?",
    answer: "Yes, completely free, with no account or sign-up required.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export function FAQ() {
  return (
    <div className="faq">
      <section className="faq-intro" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading">How it works</h2>
        <ol className="how-it-works">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title}>
              <span className="how-it-works-index" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="faq-list" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Frequently asked questions</h2>
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="faq-item">
            <summary>
              <span>{item.question}</span>
              <ChevronDown size={18} className="faq-chevron" aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>

      <script
        type="application/ld+json"
        // Static, developer-controlled JSON: no user input flows into it,
        // so it needs no CSP nonce (see the JSON-LD comment in layout.tsx).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
