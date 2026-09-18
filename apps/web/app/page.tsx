import { AuthPanel } from "@/components/app/auth/AuthPanel";
import { PrivacyStrip } from "@/components/brand/PrivacyStrip";
import { ProofArtifact } from "@/components/brand/ProofArtifact";
import { SiteHeader } from "@/components/brand/SiteHeader";

export default function Home() {
  return (
    <div id="top" className="flex min-h-dvh flex-col bg-paper">
      <SiteHeader />

      {/*
        One split, two axes. Below lg everything stacks: claim, proof, privacy,
        then the auth panel last so the form sits in the thumb zone. At lg the
        panel becomes a bordered right rail and the claim keeps the wide side.
        At xl the claim and the proof artifact split that wide side in two.
      */}
      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 sm:px-6 lg:px-9">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
          <div className="lg:pe-9">
            <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="space-y-4 py-9 xl:pe-9">
                <h1 className="font-display text-[1.75rem] leading-[1.15] font-semibold text-ink sm:text-[2rem] xl:text-[2.125rem]">
                  Find the login by describing it.
                  <span className="mt-2 block text-ink-muted">
                    Ahaai finds it and never reads it.
                  </span>
                </h1>
                <p className="max-w-[48ch] text-[15px] leading-relaxed text-ink-muted">
                  Type what you remember, even half a thought. Ahaai matches it
                  against tokens minted for that one request, so the model ranks
                  placeholders while the real credential stays sealed in this
                  browser.
                </p>
                <p className="pt-2">
                  <a
                    href="#privacy"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink underline underline-offset-4 decoration-line-strong transition-colors hover:text-primary"
                  >
                    See how it stays private
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 3.5v9M4.5 9 8 12.5 11.5 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </p>
              </div>

              <div className="pb-9 xl:border-s xl:border-line xl:ps-9 xl:pt-9">
                <ProofArtifact />
              </div>
            </div>

            <PrivacyStrip className="border-t border-line py-9" />
          </div>

          <AuthPanel />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-6 text-[12.5px] text-ink-faint sm:px-6 lg:px-9">
          <p>
            Ahaai holds a wrapped vault key it cannot open. That is the whole
            design.
          </p>
          <p className="mono-data">argon2id, aes-256-gcm</p>
        </div>
      </footer>
    </div>
  );
}
