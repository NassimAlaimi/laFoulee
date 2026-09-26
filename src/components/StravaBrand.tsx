/**
 * Éléments de marque Strava, fichiers officiels non modifiés
 * (developers.strava.com/guidelines — bouton de 48 px, logo « Powered by »
 * noir sur fond clair, blanc sur fond sombre). Jamais plus visibles que le
 * nom de l'app.
 */

/** Bouton « Connect with Strava » officiel, à placer dans un <button> ou un <a>. */
export function ConnectWithStrava() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/strava/btn_strava_connect_with_orange.svg"
      alt="Connect with Strava"
      width={237}
      height={48}
      className="h-12 w-auto"
    />
  );
}

export function PoweredByStrava({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/strava/api_logo_pwrdBy_strava_horiz_black.svg"
        alt="Powered by Strava"
        width={146}
        height={15}
        className="h-[15px] w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/strava/api_logo_pwrdBy_strava_horiz_white.svg"
        alt="Powered by Strava"
        width={146}
        height={15}
        className="hidden h-[15px] w-auto dark:block"
      />
    </span>
  );
}
