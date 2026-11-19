/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/scriptable": ["./scriptable/**"],
    "/api/scriptable/widget": ["./scriptable/**"],
  },
};
export default nextConfig;
