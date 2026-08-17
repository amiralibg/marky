import type { Arch, Os } from "./releases";

export type DetectedPlatform = {
  os: Os;
  arch: Arch;
  label: string;
  archLabel: string;
};

const OS_LABEL: Record<Os, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

const ARCH_LABEL: Record<Os, Record<Arch, string>> = {
  macos: { arm64: "Apple Silicon", amd64: "Intel" },
  windows: { arm64: "ARM64", amd64: "AMD64" },
  linux: { arm64: "ARM64", amd64: "AMD64" },
};

export function archLabel(os: Os, arch: Arch) {
  return ARCH_LABEL[os][arch];
}

export function osLabel(os: Os) {
  return OS_LABEL[os];
}

function guessOs(): Os {
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;

  const haystack = `${ua} ${platform} ${uaData?.platform ?? ""}`.toLowerCase();
  if (
    haystack.includes("mac") ||
    haystack.includes("darwin") ||
    haystack.includes("iphone") ||
    haystack.includes("ipad")
  ) {
    return "macos";
  }
  if (haystack.includes("win")) return "windows";
  if (haystack.includes("linux") || haystack.includes("cros") || haystack.includes("android"))
    return "linux";
  return "macos";
}

function guessArch(os: Os): Arch {
  const ua = navigator.userAgent.toLowerCase();
  if (/(aarch64|arm64|apple silicon)/i.test(ua)) return "arm64";
  if (/(x86_64|amd64|wow64|win64|x64)/i.test(ua)) return "amd64";
  if (os === "macos") return "arm64";
  return "amd64";
}

export function detectPlatform(): DetectedPlatform {
  const os = guessOs();
  const arch = guessArch(os);
  return {
    os,
    arch,
    label: OS_LABEL[os],
    archLabel: ARCH_LABEL[os][arch],
  };
}

export async function refineArch(current: DetectedPlatform): Promise<DetectedPlatform> {
  const uaData = navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues?: (
        hints: string[]
      ) => Promise<{ architecture?: string; platform?: string }>;
    };
  };

  try {
    const values = await uaData.userAgentData?.getHighEntropyValues?.(["architecture", "platform"]);
    if (!values?.architecture) return current;
    const arch: Arch = /arm/i.test(values.architecture) ? "arm64" : "amd64";
    return {
      ...current,
      arch,
      archLabel: ARCH_LABEL[current.os][arch],
    };
  } catch {
    return current;
  }
}
