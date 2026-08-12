import { Spinner } from "@/components/ui/Spinner";

/**
 * Route-level loading state (OBSERVED §6, screenshot 3): a single blue circular
 * spinner centered on the white card while a route segment streams in.
 */
export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size={40} label="Loading" />
    </div>
  );
}
