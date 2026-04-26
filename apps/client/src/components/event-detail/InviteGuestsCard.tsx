import { Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface InviteGuestsCardProps {
  inviteUrl: string;
  isLoading?: boolean;
  className?: string;
}

const InviteGuestsCard = ({ inviteUrl, isLoading, className }: InviteGuestsCardProps) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-md",
        className,
      )}
    >
      <header className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Share2 className="h-4 w-4 text-accent" />
        Invite Guests
      </header>

      <div className="flex flex-col items-center gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-48 w-48 rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </>
        ) : (
          <>
            <div className="p-4">
              <QRCodeSVG
                value={inviteUrl}
                size={176}
                level="H"
                bgColor="transparent"
                fgColor="hsl(158 65% 62%)"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
              Copy Invite Link
            </Button>
          </>
        )}
      </div>
    </section>
  );
};

export default InviteGuestsCard;
