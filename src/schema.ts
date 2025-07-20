import { z } from 'zod';

// Schema for variant specifics (size, color, etc.)
export const VariantSpecificSchema = z.object({
  dimension: z.string(),
  value: z.string()
});

// Schema for product variants
export const ProductVariantSchema = z.object({
  variant_specifics: z.array(VariantSpecificSchema),
  product_id: z.string()
});

// Schema for package dimensions
export const PackageDimensionsSchema = z.object({
  weight: z.object({
    amount: z.number(),
    unit: z.string()
  }),
  size: z.object({
    width: z.object({
      amount: z.number(),
      unit: z.string()
    }),
    depth: z.object({
      amount: z.number(),
      unit: z.string()
    }),
    length: z.object({
      amount: z.number(),
      unit: z.string()
    })
  })
});

// Schema for EPIDs (External Product Identifiers)
export const EpidSchema = z.object({
  type: z.string(),
  value: z.string()
});

// Main product schema
export const ProductSchema = z.object({
  status: z.enum(['completed', 'error', 'loading']),
  original_retail_price: z.union([z.number(), z.null()]).optional(),
  timestamp: z.union([z.number(), z.null()]).optional(),
  all_variants: z.array(ProductVariantSchema).optional(),
  retailer: z.string().optional(),
  variant_specifics: z.union([z.array(VariantSpecificSchema), z.object({
    dimension: z.string(),
    value: z.string()
  })]).optional(),
  main_image: z.union([z.string(), z.null()]).optional(),
  images: z.array(z.string()).optional(),
  package_dimensions: z.union([PackageDimensionsSchema, z.object({})]).optional(),
  epids: z.array(EpidSchema).optional(),
  product_id: z.string().optional(),
  categories: z.array(z.string()).optional(),
  review_count: z.number().optional(),
  title: z.string().optional(),
  brand: z.string().optional(),
  product_description: z.union([z.string(), z.array(z.string())]).optional(),
  product_details: z.array(z.string()).optional(),
  stars: z.union([z.number(), z.null()]).optional(),
  price: z.union([z.number(), z.null()]).optional(),
  error: z.union([z.string(), z.null()]).optional()
});

export type Product = z.infer<typeof ProductSchema>;
export type VariantSpecific = z.infer<typeof VariantSpecificSchema>;
export type ProductVariant = z.infer<typeof ProductVariantSchema>;
export type PackageDimensions = z.infer<typeof PackageDimensionsSchema>;
export type Epid = z.infer<typeof EpidSchema>; 