import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBusinessSocialProfiles } from "@/lib/social-scan.functions";

export function socialProfilesQueryKey(businessId: string) {
  return ["social-profiles", businessId] as const;
}

export function useSocialProfiles(businessId: string) {
  const getProfiles = useServerFn(getBusinessSocialProfiles);
  return useQuery({
    queryKey: socialProfilesQueryKey(businessId),
    queryFn: () => getProfiles({ data: { businessId } }),
    staleTime: 30_000,
  });
}
