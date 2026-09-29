import type { Metadata } from "next";
import { EditorialLookbook } from "@/components/editorial-lookbook";
export const metadata: Metadata = { title: "The HIDI Lookbook", description: "Explore HIDI editorial styling for work, everyday and occasions.", alternates: { canonical: "/lookbook" } };
export default function LookbookPage() { return <EditorialLookbook archive />; }
