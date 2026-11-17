import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOADING_DELAY_MS,
  LOADING_MIN_MS,
  useDelayedFlag,
  useLoadingPhase,
} from "./useDelayedFlag";
import { BusyButton, BusyDots, Loadable, LoadingState } from "./Loading";
import EmptyState from "./EmptyState";

const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

const mockReducedMotion = (reduce) => {
  window.matchMedia = vi.fn((query) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("useDelayedFlag", () => {
  it("shows nothing for work that ends before the delay", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), {
      initialProps: { active: true },
    });
    advance(LOADING_DELAY_MS - 10);
    expect(result.current).toBe(false);
    rerender({ active: false });
    advance(LOADING_DELAY_MS * 4);
    expect(result.current).toBe(false);
  });

  it("shows after the delay", () => {
    const { result } = renderHook(() => useDelayedFlag(true));
    expect(result.current).toBe(false);
    advance(LOADING_DELAY_MS);
    expect(result.current).toBe(true);
  });

  it("keeps a shown indicator up for the minimum time", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), {
      initialProps: { active: true },
    });
    advance(LOADING_DELAY_MS);
    expect(result.current).toBe(true);
    advance(50);
    rerender({ active: false });
    advance(LOADING_MIN_MS - 60);
    expect(result.current).toBe(true);
    advance(20);
    expect(result.current).toBe(false);
  });

  it("hides at once when the work outlasted the minimum", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), {
      initialProps: { active: true },
    });
    advance(LOADING_DELAY_MS + LOADING_MIN_MS + 500);
    rerender({ active: false });
    advance(0);
    expect(result.current).toBe(false);
  });

  it("stays up through a brief gap in the work", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), {
      initialProps: { active: true },
    });
    advance(LOADING_DELAY_MS);
    rerender({ active: false });
    advance(50);
    rerender({ active: true });
    advance(LOADING_MIN_MS * 2);
    expect(result.current).toBe(true);
  });
});

describe("useLoadingPhase", () => {
  it("goes waiting → loading → ready, holding loading for the minimum", () => {
    const { result, rerender } = renderHook(({ loading }) => useLoadingPhase(loading), {
      initialProps: { loading: true },
    });
    expect(result.current).toBe("waiting");
    advance(LOADING_DELAY_MS);
    expect(result.current).toBe("loading");
    rerender({ loading: false });
    expect(result.current).toBe("loading");
    advance(LOADING_MIN_MS);
    expect(result.current).toBe("ready");
  });

  it("is ready straight away for fast work", () => {
    const { result, rerender } = renderHook(({ loading }) => useLoadingPhase(loading), {
      initialProps: { loading: true },
    });
    rerender({ loading: false });
    expect(result.current).toBe("ready");
  });
});

describe("Loadable", () => {
  it("is blank, then the placeholder, then the content", () => {
    const view = (loading) => (
      <Loadable loading={loading} label="Loading notes" placeholder={<i data-testid="skel" />}>
        <p>Content</p>
      </Loadable>
    );
    const { rerender } = render(view(true));
    expect(screen.queryByTestId("skel")).toBeNull();
    expect(screen.queryByText("Content")).toBeNull();
    advance(LOADING_DELAY_MS);
    expect(screen.getByTestId("skel")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading notes");
    rerender(view(false));
    expect(screen.queryByText("Content")).toBeNull();
    advance(LOADING_MIN_MS);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});

describe("BusyButton", () => {
  it("is disabled at once and shows the dots in its icon's place after the delay", () => {
    const icon = <svg data-testid="icon" />;
    const { rerender, container } = render(
      <BusyButton busy icon={icon}>
        Export
      </BusyButton>
    );
    const button = screen.getByRole("button", { name: "Export" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    advance(LOADING_DELAY_MS);
    expect(screen.queryByTestId("icon")).toBeNull();
    expect(container.querySelector(".busy-icon .busy-dots")).not.toBeNull();
    // The label stays: the button keeps its width.
    expect(button).toHaveTextContent("Export");

    rerender(
      <BusyButton busy={false} icon={icon}>
        Export
      </BusyButton>
    );
    expect(button).not.toBeDisabled();
    advance(LOADING_MIN_MS);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("puts the dots over the label when it has no icon", () => {
    const onClick = vi.fn();
    const { container } = render(
      <BusyButton busy onClick={onClick}>
        Sync now
      </BusyButton>
    );
    advance(LOADING_DELAY_MS);
    expect(container.querySelector(".busy-overlay .busy-dots")).not.toBeNull();
    expect(container.querySelector("[data-busy]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("reduced motion", () => {
  it("marks every primitive still when reduced motion is asked for", () => {
    mockReducedMotion(true);
    const { container } = render(
      <>
        <EmptyState icon="search" title="No results" body="Try another word." />
        <BusyDots />
        <LoadingState label="Loading">
          <span className="skeleton" />
        </LoadingState>
      </>
    );
    advance(LOADING_DELAY_MS);
    expect(container.querySelector(".empty-state")).toHaveAttribute("data-motion", "none");
    expect(container.querySelector(".busy-dots")).toHaveAttribute("data-motion", "none");
    expect(screen.getByRole("status")).toHaveAttribute("data-motion", "none");
  });

  it("leaves them animated otherwise", () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector(".empty-state")).not.toHaveAttribute("data-motion");
  });
});

describe("EmptyState", () => {
  it("draws a line icon, a title, one line of help and one quiet action", () => {
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState
        icon="folder"
        title="This folder is empty"
        body="Start a note here."
        action={{ label: "New note here", onClick }}
      />
    );
    const path = container.querySelector("svg.empty-icon path");
    expect(path).toHaveAttribute("pathLength", "1");
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "New note here" });
    expect(button).toHaveClass("btn");
    expect(button).not.toHaveClass("btn-primary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fills the action only when it is the view's one accent action", () => {
    render(
      <EmptyState title="No vault" action={{ label: "Open", onClick: () => {}, primary: true }} />
    );
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass("btn-primary");
  });
});
