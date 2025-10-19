import { useParams } from 'react-router-dom';

export default function ExportPage() {
  const { projectId } = useParams();

  return (
    <div className="card max-w-4xl mx-auto text-center">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Export to WordPress</h1>
      <p className="text-gray-600 mb-4">Project ID: {projectId}</p>
      <p className="text-gray-500">
        This page would let users select WordPress builder and download the optimized, plugin-free package.
      </p>
    </div>
  );
}
