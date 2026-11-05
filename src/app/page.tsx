import { NowView } from "@/components/deck/NowView";

/**
 * Now — the live deck. Notice → classify in mode → offer or batch, as it
 * happens. Composition lives in NowView, which decides what is worth showing.
 */
export default function NowPage() {
  return <NowView />;
}
