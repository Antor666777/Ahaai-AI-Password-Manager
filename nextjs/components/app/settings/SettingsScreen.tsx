"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Divider } from "@/components/ui/data";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type {
  ApiProvider,
  ApiSettings,
  ProviderPreset,
} from "@/lib/client/types";
import { AccountSection } from "./AccountSection";
import { AiModeSection } from "./AiModeSection";
import { ProvidersSection } from "./ProvidersSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

function SettingsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto w-full max-w-3xl space-y-9 px-4 py-9 sm:px-6 lg:px-9"
    >
      <span className="sr-only">Loading your settings.</span>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-72" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-80" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const { status, user, settings, setSettings } = useSession();

  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const result = await api.providers();
      setProviders(result.providers);
      setPresets(result.presets);
      setLoadError(null);
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setLoadError(
        failureCopy(
          failure,
          "The provider list did not load. Try again in a moment.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /** Same request, but the list goes back to its skeleton first. */
  const reloadProviders = useCallback(async () => {
    setLoading(true);
    await loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    /* The provider list is fetched once per session. Every setState in this
       path lands after the request settles, which is the intended client-side
       load pattern, not a synchronous cascading render. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void loadProviders();
  }, [status, loadProviders]);

  if (status === "loading") return <SettingsLoading />;

  if (status === "anonymous" || !user || !settings) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-9 sm:px-6 lg:px-9">
        <Callout tone="neutral" title="Settings need a signed in session">
          Everything on this page belongs to one account. Sign in, then come
          back to change how AI search runs.
          <span className="mt-3 block">
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Sign in
            </Link>
          </span>
        </Callout>
      </div>
    );
  }

  const defaultProvider =
    providers.find((item) => item.id === settings.defaultProviderId) ?? null;
  const defaultPresetLabel = defaultProvider
    ? (presets.find((item) => item.id === defaultProvider.presetId)?.label ??
      defaultProvider.presetId)
    : null;
  const providersReady = !loading && loadError === null;
  const localProviderCount = providers.filter((item) => item.isLocal).length;
  const cloudProviderCount = providers.length - localProviderCount;

  function saveSettings(next: ApiSettings) {
    setSettings(next);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-9 sm:px-6 lg:px-9">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
          Two decisions shape AI search: how prompts travel and which provider
          answers. The rest covers your account and how you close it.
        </p>
      </header>

      <div className="mt-9 space-y-9">
        <AiModeSection
          aiMode={settings.aiMode}
          defaultProviderId={settings.defaultProviderId}
          defaultProvider={defaultProvider}
          defaultPresetLabel={defaultPresetLabel}
          providersReady={providersReady}
          localProviderCount={localProviderCount}
          cloudProviderCount={cloudProviderCount}
          onSaved={saveSettings}
        />

        <Divider />

        <ProvidersSection
          providers={providers}
          presets={presets}
          loading={loading}
          loadError={loadError}
          onReload={() => void reloadProviders()}
          settings={settings}
          onSettings={saveSettings}
          onAdded={(provider) =>
            setProviders((current) => [...current, provider])
          }
          onRemoved={(id) =>
            setProviders((current) => current.filter((item) => item.id !== id))
          }
          onUpdated={(provider) =>
            setProviders((current) =>
              current.map((item) => (item.id === provider.id ? provider : item)),
            )
          }
        />

        <Divider />

        <AccountSection />
      </div>

      <footer className="mt-9 border-t border-line pt-4">
        <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-ink-faint">
          Nothing on this page changes how items are sealed. The master password
          and the vault key stay in this browser.
        </p>
      </footer>
    </div>
  );
}
