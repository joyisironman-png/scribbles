/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/api/scriptable": ["./scriptable/**"] },
};
export default nextConfig;
