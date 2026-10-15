import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imageUrl, newFolder, deleteOriginal } = await req.json();

    if (!imageUrl || !newFolder) {
      return new Response(JSON.stringify({ error: "imageUrl and newFolder are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BUCKET = "binventory-storage";

    // Extract path from Supabase or Firebase URL
    let oldPath: string | null = null;
    if (imageUrl.includes("/binventory-storage/")) {
      const parts = imageUrl.split("/binventory-storage/");
      oldPath = parts[1]?.split("?")[0];
    } else {
      const url = new URL(imageUrl);
      const pathname = decodeURIComponent(url.pathname);
      const fileIndex = pathname.indexOf("/file_processing/");
      const videoIndex = pathname.indexOf("/video_processing/");
      if (fileIndex !== -1) oldPath = pathname.substring(fileIndex + 1);
      else if (videoIndex !== -1) oldPath = pathname.substring(videoIndex + 1);
    }

    if (!oldPath) {
      return new Response(JSON.stringify({ error: "Could not extract storage path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileName = oldPath.split("/").pop();
    const newPath = `${newFolder}/${fileName}`;

    // Copy to new destination in Supabase Storage
    const { error: copyError } = await supabase.storage.from(BUCKET).copy(oldPath, newPath);
    if (copyError) {
      console.error("Copy error:", copyError);
      return new Response(JSON.stringify({ error: copyError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally delete original if requested
    if (deleteOriginal === true) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(newPath);

    return new Response(
      JSON.stringify({ newUrl: publicUrl, newPath }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
